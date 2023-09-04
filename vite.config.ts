import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { vitePluginPage } from "./vitePluginPage";

// https://vitejs.dev/config/
export default defineConfig(({ ssrBuild }) => ({
  build: {
    outDir: ssrBuild ? "build/server" : "build",
    sourcemap: true,
  },
  plugins: [vitePluginPage(), preact()].filter(Boolean),
  publicDir: false,
  server: { port: 3000 },
}));
