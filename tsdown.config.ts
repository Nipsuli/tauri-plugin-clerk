import { defineConfig } from "tsdown/config";

export default defineConfig({
  entry: "guest-js/index.ts",
  platform: "browser",
  outDir: "dist-js",
  dts: true,
});
