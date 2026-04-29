import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/inventory-manager/",
  plugins: [react(), tsconfigPaths(), tailwindcss()],
  server: {
    host: "::",
  },
});
