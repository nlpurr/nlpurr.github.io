import type { AstroIntegration } from "astro";
import * as fs from "fs/promises";
import * as path from "path";
import sanitizeHtml from "sanitize-html";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { LAST_BUILD_TIME } from "../constants";

const rssContentEnhancer = (): AstroIntegration => {
  return {
    name: "rss-content-enhancer",
    hooks: {
      "astro:build:done": async () => {
        const distDir = "dist";
        const tempDir = "./tmp/rss-cache";
        const rssPath = path.join(distDir, "rss.xml");

        // Create temp directory if it doesn't exist
        await fs.mkdir(tempDir, { recursive: true });

        // Read and parse RSS XML
        const rssContent = await fs.readFile(rssPath, "utf-8");

        const parserOptions = {
          ignoreAttributes: false,
          attributeNamePrefix: "",
          textNodeName: "#text",
          arrayMode: false, // Do not wrap elements in arrays
        };

        const parser = new XMLParser(parserOptions);
        const rssData = parser.parse(rssContent);

        // Extract base URL from channel link
        const baseUrl = rssData.rss.channel.link.replace(/\/$/, ""); // Remove trailing slash if present

        // Ensure items are in an array
        const items = Array.isArray(rssData.rss.channel.item)
          ? rssData.rss.channel.item
          : [rssData.rss.channel.item];

        // Process each item
        for (const item of items) {
          const encodedSlug = item.link.split("/").pop();
          const slug = decodeURIComponent(encodedSlug);
          const htmlPath = path.join(distDir, "posts", slug, "index.html");

          try {
            const htmlContent = await fs.readFile(htmlPath, "utf-8");

            const lastUpdated = item.lastUpdatedTimestamp;
            if (!lastUpdated) {
              continue;
            }

            const cachePath = path.join(tempDir, `${slug}.html`);

            // Check cache
            let shouldUpdate = true;

            // Check if cache exists
            try {
              await fs.access(cachePath);

              // If cache exists and LAST_BUILD_TIME exists, use it to determine if we need to update
              if (LAST_BUILD_TIME) {
                const lastBuildTime = new Date(LAST_BUILD_TIME);
                shouldUpdate = new Date(lastUpdated) > lastBuildTime;
              }
            } catch {
              // Cache doesn't exist, need to sanitize
              shouldUpdate = true;
            }

            if (shouldUpdate) {
              // Extract main content (assuming it's in <main> tag)
              const mainMatch = htmlContent.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
              if (mainMatch) {
                const mainContent = mainMatch[1];

                // Sanitize HTML and fix image paths
                const cleanContent = sanitizeHtml(mainContent, {
                  allowedTags: [
                    // Document sections
                    "address",
                    "article",
                    "aside",
                    "footer",
                    "header",
                    "h1",
                    "h2",
                    "h3",
                    "h4",
                    "h5",
                    "h6",
                    "hgroup",
                    "main",
                    "nav",
                    "section",

                    // Block text content
                    "blockquote",
                    "dd",
                    "div",
                    "dl",
                    "dt",
                    "figcaption",
                    "figure",
                    "hr",
                    "li",
                    "main",
                    "ol",
                    "p",
                    "pre",
                    "ul",
                    "details",
                    "summary",

                    // Inline text
                    "a",
                    "abbr",
                    "b",
                    "bdi",
                    "bdo",
                    "br",
                    "cite",
                    "code",
                    "data",
                    "dfn",
                    "em",
                    "i",
                    "kbd",
                    "mark",
                    "q",
                    "rb",
                    "rp",
                    "rt",
                    "rtc",
                    "ruby",
                    "s",
                    "samp",
                    "small",
                    "span",
                    "strong",
                    "sub",
                    "sup",
                    "time",
                    "u",
                    "var",
                    "wbr",

                    // Table content
                    "caption",
                    "col",
                    "colgroup",
                    "table",
                    "tbody",
                    "td",
                    "tfoot",
                    "th",
                    "thead",
                    "tr",

                    // Media
                    "img",
                    // 'iframe'
                  ],
                  allowedAttributes: {
                    a: ["href", "title"],
                    img: ["src", "alt", "title"],
                    td: ["align", "valign"],
                    th: ["align", "valign", "colspan", "rowspan", "scope"],
                    // iframe: ['src'],
                    pre: ['data-language'],
                  },
                  disallowedTagsMode: "discard",
                  nonTextTags: ["style", "script", "textarea", "option", "noscript", "template"],
                  exclusiveFilter: function(frame) {
                    return frame.attribs?.class?.includes('toc-container') ||
                           frame.attribs?.class?.includes('table-of-contents') ||
                           frame.attribs?.class?.includes('sr-only') ||
                           (frame.attribs?.["data-popover-target"] && frame.attribs?.["data-href"]?.startsWith("#")) ||
                           frame.attribs?.id === "autogenerated-post-comments" ||
                           frame.attribs?.id === "autogenerated-media-links" ||
                           frame.attribs?.id === "autogenerated-external-links" ||
                           (frame.tag==="strong" && frame.text.trim().toLowerCase() === "table of contents") ||
                           frame.tag==="h1" ||
                           (frame.tag === 'span' && !frame.text.trim()) ||
                           (frame.tag === 'p' && !frame.text.trim());
                  },
                  transformTags: {
                    details: (tagName, attribs) => ({
                      tagName: "div",
                      attribs: attribs,
                    }),
                    summary: (tagName, attribs) => ({
                      tagName: "div",
                      attribs: attribs,
                    }),
                    a: (tagName, attribs) => {
                      // For image lightbox links, return false to remove the anchor
                      if (attribs.class?.includes("mediaglightbox")) {
                        return false;
                      }
                      // Add base URL to relative URLs
                      if (attribs.href?.startsWith("/")) {
                        return {
                          tagName,
                          attribs: {
                            ...attribs,
                            href: `${baseUrl}${attribs.href}`,
                          },
                        };
                      }
                      return { tagName, attribs };
                    },
                    span: (tagName, attribs) => {
                      if (attribs["data-popover-target"]) {
                        const href = attribs["data-href"];
                        if (href?.startsWith("/posts/")) {
                          return {
                            tagName: "a",
                            attribs: {
                              ...attribs,
                              href: `${baseUrl}${href}`,
                            },
                          };
                        }
                      }
                      return { tagName, attribs };
                    },
                    img: (tagName, attribs) => {
                      if (
                        attribs.src?.startsWith("https://www.notion.so/icons/") ||
                        attribs.alt?.startsWith("custom emoji with name ")
                      ) {
                        return false;
                      }
                      if (attribs.src?.startsWith("/notion/")) {
                        return {
                          tagName,
                          attribs: {
                            ...attribs,
                            src: `${baseUrl}${attribs.src}`,
                          },
                        };
                      }
                      return { tagName, attribs };
                    },
                  }
                });

                // Function to recursively remove empty elements
                const removeEmptyElements = (html: string): string => {
                  const prevHtml = html;
                  // Remove empty elements with no content or only whitespace
                  const cleaned = html
                    .replace(/<div[^>]*>(\s*)<\/div>/g, '')
                    // .replace(/<p[^>]*>(\s*)<\/p>/g, '')
                    // .replace(/<span[^>]*>(\s*)<\/span>/g, '')
                    .replace(/<section[^>]*>(\s*)<\/section>/g, '');
                  // If no changes were made, we're done
                  if (prevHtml === cleaned) {
                    return cleaned;
                  }

                  // Otherwise, recursively clean until no more empty elements
                  return removeEmptyElements(cleaned);
                };

                // Remove empty elements before removing title
                const cleanContent_emptyremoved = removeEmptyElements(cleanContent);

                // Remove the first h1 (title)
                // const contentWithoutTitle = cleanContent_emptyremoved.replace(/<h1[^>]*>.*?<\/h1>/i, "");

                // Cache the cleaned content
                await fs.writeFile(cachePath, cleanContent_emptyremoved);

                // Add content tag to RSS item
                item.content = cleanContent_emptyremoved;

                // If description is empty, generate from content
                if (!item.description?.trim()) {
                  // Remove HTML tags and get plain text
                  const plainText = cleanContent_emptyremoved.replace(/<[^>]+>/g, "").trim();
                  // Get first 50 characters and add ellipsis
                  item.description = plainText.slice(0, 150) + (plainText.length > 150 ? "..." : "");
                }
              }
            } else {
              // Use cached version
              const cachedContent = await fs.readFile(cachePath, "utf-8");
              item.content = cachedContent;

              // If description is empty, generate from cached content
              if (!item.description?.trim()) {
                const plainText = cachedContent.replace(/<[^>]+>/g, "").trim();
                item.description = plainText.slice(0, 50) + (plainText.length > 50 ? "&hellip;" : "");
              }
            }
          } catch (error) {
            console.error(`Error processing ${slug}:`, error);
          }
        }

        // Update the items back to the channel
        // Build the RSS object
        const rssObject = {
          rss: {
            "@version": "2.0",
            channel: {
              title: rssData.rss.channel.title,
              description: rssData.rss.channel.description,
              link: rssData.rss.channel.link,
              lastBuildDate: rssData.rss.channel.lastBuildDate,
              ...(rssData.rss.channel.author && { author: rssData.rss.channel.author }),
              item: items.map((item) => ({
                title: item.title,
                link: item.link,
                guid: {
                  "@isPermaLink": "true",
                  "#": item.link,
                },
                description: item.description,
                pubDate: item.pubDate,
                lastUpdatedTimestamp: item.lastUpdatedTimestamp,
                ...(item.category && {
                  category: Array.isArray(item.category) ? item.category : [item.category],
                }),
                ...(item.content && { content: item.content }),
              })),
            },
          },
        };

        // Build and save the updated RSS
        const builderOptions = {
          ignoreAttributes: false,
          format: true,
          suppressEmptyNode: true,
          suppressBooleanAttributes: false,
          attributeNamePrefix: "@",
          parseTagValue: false,
          textNodeName: "#",
        };

        const builder = new XMLBuilder(builderOptions);
        const updatedRss = builder.build(rssObject);

        // Add XML declaration and stylesheet
        const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8"?>\n';
        const styleSheet = '<?xml-stylesheet href="/rss-styles.xsl" type="text/xsl"?>\n';
        const finalXml = xmlDeclaration + styleSheet + updatedRss;

        await fs.writeFile(rssPath, finalXml);
      },
    },
  };
};

export default rssContentEnhancer;
