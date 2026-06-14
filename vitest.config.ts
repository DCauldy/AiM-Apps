import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    css: true,
    environment: "jsdom",
    globals: false,
    include: [
      "**/*.{test,spec}.{ts,tsx,js,jsx,mjs}",
    ],
    setupFiles: ["./test/setup.ts"],
  },
});
