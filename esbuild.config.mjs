import esbuild from "esbuild";
import process from "process";
import fs from "fs";

const prod = process.argv[2] === "production";

fs.mkdirSync("dist", { recursive: true });

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "dist/main.js",
});

function copyStatics() {
  fs.copyFileSync("manifest.json", "dist/manifest.json");
  fs.copyFileSync("styles.css", "dist/styles.css");
}

if (prod) {
  await context.rebuild();
  copyStatics();
  process.exit(0);
} else {
  copyStatics();
  await context.watch();
}
