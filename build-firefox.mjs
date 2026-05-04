import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist-firefox", { recursive: true, force: true });
mkdirSync("dist-firefox", { recursive: true });

await Promise.all([
  build({
    entryPoints: ["src/content/main.ts"],
    bundle: true,
    outfile: "dist-firefox/content.js",
    format: "iife",
    target: "firefox128",
    sourcemap: false,
    minify: false
  }),
  build({
    entryPoints: ["src/background.ts"],
    bundle: true,
    outfile: "dist-firefox/background.js",
    format: "iife",
    target: "firefox128",
    sourcemap: false,
    minify: false
  }),
  build({
    entryPoints: ["src/popup/main.ts"],
    bundle: true,
    outfile: "dist-firefox/popup.js",
    format: "iife",
    target: "firefox128",
    sourcemap: false,
    minify: false
  })
]);

cpSync("src/manifest.firefox.json", "dist-firefox/manifest.json");
cpSync("src/popup/popup.html", "dist-firefox/popup.html");
cpSync("src/popup/popup.css", "dist-firefox/popup.css");
