import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist-chrome", { recursive: true, force: true });
mkdirSync("dist-chrome", { recursive: true });

await Promise.all([
  build({
    entryPoints: ["src/content/main.ts"],
    bundle: true,
    outfile: "dist-chrome/content.js",
    format: "iife",
    target: "chrome114",
    sourcemap: false,
    minify: false
  }),
  build({
    entryPoints: ["src/background.ts"],
    bundle: true,
    outfile: "dist-chrome/background.js",
    format: "iife",
    target: "chrome114",
    sourcemap: false,
    minify: false
  }),
  build({
    entryPoints: ["src/popup/main.ts"],
    bundle: true,
    outfile: "dist-chrome/popup.js",
    format: "iife",
    target: "chrome114",
    sourcemap: false,
    minify: false
  }),
  build({
    entryPoints: ["src/content/scraper.ts"],
    bundle: true,
    outfile: "dist-chrome/scraper.js",
    format: "iife",
    target: "chrome114",
    sourcemap: false,
    minify: false
  })
]);

cpSync("src/manifest.json", "dist-chrome/manifest.json");
cpSync("src/popup/popup.html", "dist-chrome/popup.html");
cpSync("src/popup/popup.css", "dist-chrome/popup.css");
