import { defineConfig } from "vite-plus";

// Chrome loads content scripts as classic scripts, so each one gets its own IIFE
// build: the content script, and the page script that runs in the site's own world.
// The side panel and the (module) service worker share chunks.
const classicScript = (name: string, input: string) => ({
  consumer: "client" as const,
  build: {
    emptyOutDir: false,
    copyPublicDir: false,
    rolldownOptions: {
      input: { [name]: input },
      output: { format: "iife" as const, entryFileNames: "[name].js" },
    },
  },
});

export default defineConfig({
  root: "src",
  publicDir: "../public",
  // With the dependencies, rather than in src/node_modules.
  cacheDir: "../node_modules/.vite",
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
    content: classicScript("content", "src/content/index.ts"),
    page: classicScript("page", "src/content/page.ts"),
  },
  // Builds every environment, not just the client.
  builder: {},
});
