import fs from 'node:fs';
import type { AstroIntegration } from 'astro';
import config from '../../constants-config.json';
const key_value_from_json = { ...config };
const theme_config = key_value_from_json["THEME"];

export default (): AstroIntegration => ({
  name: 'theme-constants-to-css',
  hooks: {
    'astro:build:start': async () => {
      // Define the path to the constants-config.json file

      // Function to create CSS variables from the config
      const createCssVariables = (theme) => {
        let cssContent = '';
        for (const key in config.THEME.colors) {
          const color = theme_config.colors[key];
          cssContent += `--theme-${key}: ${color[theme]};\n`;
        }
        return cssContent;
      };

      // Generate CSS content for light and dark themes
      let cssContent = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    color-scheme: light;
    ${createCssVariables('light')}
  }

  :root.dark {
    color-scheme: dark;
    ${createCssVariables('dark')}
  }

  html {
    @apply scroll-smooth;
  }

  html body {
    @apply mx-auto flex min-h-screen max-w-3xl flex-col bg-bgColor px-8 pt-8 text-textColor antialiased overflow-x-hidden;
  }
}`;

      // Define the path to the output CSS file
      const cssOutputPath = "src/styles/global.css";

      // Write the CSS content to the file
      fs.writeFileSync(cssOutputPath, cssContent);
    },
  },
});
