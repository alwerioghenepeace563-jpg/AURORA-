import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ["attacked-monitored-input-selecting.trycloudflare.com"]
  },
  build: { outDir: "dist" }
});
