import { defineConfig } from "vite-plus";

// Chrome loads content scripts as classic scripts, so the content script gets
// its own IIFE build. The side panel and the (module) service worker share chunks.
export default defineConfig({
  root: "src",
  publicDir: "../public",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    modulePreload: false,
    target: "chrome123",
  },
  environments: {
    client: {
      build: {
        rolldownOptions: {
          input: {
            sidepanel: "src/sidepanel/index.html",
            background: "src/background/index.ts",
          },
          output: { entryFileNames: "[name].js" },
        },
      },
    },
    content: {
      consumer: "client",
      build: {
        emptyOutDir: false,
        copyPublicDir: false,
        rolldownOptions: {
          input: { content: "src/content/index.ts" },
          output: { format: "iife", entryFileNames: "[name].js" },
        },
      },
    },
  },
  // Builds every environment, not just the client.
  builder: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
