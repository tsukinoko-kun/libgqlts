const path = require("path");
const { defineConfig } = require("vite");
import dts from "vite-plugin-dts";

module.exports = defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "libgqlts",
      fileName: (format) => `libgqlts.${format}.js`,
      formats: ["es", "umd"],
    },
    rollupOptions: {
      external: ["zod"], // Prevent bundling zod
    },
  },
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
});
