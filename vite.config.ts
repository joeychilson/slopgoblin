import { defineConfig } from "vite-plus";

const generated = ["site/src/routeTree.gen.ts", "site/.cloudflare/**"];

export default defineConfig({
  fmt: {
    ignorePatterns: generated,
  },
  lint: {
    plugins: ["typescript", "unicorn", "oxc", "react", "jsx-a11y"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "react/rules-of-hooks": "error",
      "react/exhaustive-deps": "error",
    },
    ignorePatterns: generated,
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    projects: ["extension", "site"],
  },
});
