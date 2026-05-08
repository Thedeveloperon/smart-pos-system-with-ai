import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

const appVersion = readFileSync(new URL("../../VERSION", import.meta.url), "utf8").trim();
const buildTimestamp = new Date().toISOString();
const buildSha = (() => {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
})();

export default defineConfig(({ mode }) => ({
  define: {
    __APP_BUILD_MODE__: JSON.stringify(mode),
    __APP_BUILD_SHA__: JSON.stringify(buildSha),
    __APP_BUILD_TIME__: JSON.stringify(buildTimestamp),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [tanstackStart(), tsconfigPaths(), react()],
  server: {
    host: "::",
  },
}));
