import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

await Promise.all([
  build({
    entryPoints: ["src/content/main.ts"],
    bundle: true,
    outfile: "dist/content.js",
    format: "iife",
    target: "chrome114",
    sourcemap: false,
    minify: false
  }),
  build({
    entryPoints: ["src/background.ts"],
    bundle: true,
    outfile: "dist/background.js",
    format: "iife",
    target: "chrome114",
    sourcemap: false,
    minify: false
  }),
  build({
    entryPoints: ["src/popup/main.ts"],
    bundle: true,
    outfile: "dist/popup.js",
    format: "iife",
    target: "chrome114",
    sourcemap: false,
    minify: false
  })
]);

cpSync("src/manifest.json", "dist/manifest.json");
cpSync("src/popup/popup.html", "dist/popup.html");
cpSync("src/popup/popup.css", "dist/popup.css");
