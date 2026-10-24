// Single offline files of the walkthroughs (plan/WALKTHROUGHS.md §2.3): one HTML per walkthrough and language, with
// the player, its styles, the desk and phone variants and every picture inside, so it plays from a pen drive in a
// training room. Each file is opened once with the network blocked to prove it needs none.
//
//   node e2e/tools/offline.mjs        reads public/walkthroughs (publish-learn.mjs), writes e2e/out/offline/
import { execSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const FROM = path.resolve("public/walkthroughs");
const OUT = path.resolve("e2e/out/offline");
execSync("npx vite build --config vite.learn.config.ts", { stdio: "ignore" });
const js = await readFile("dist-learn/player.js", "utf8");
const css = await readFile("dist-learn/player.css", "utf8").catch(() => "");
const safe = (s) => s.replace(/<\/script/gi, "<\\/script");

// The fonts inside the file, Latin and Devanagari, regular and bold: with no network, a machine without a Devanagari
// font would otherwise draw Hindi as empty boxes.
async function fonts() {
  const css = await (await fetch("https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&family=Noto+Sans+Devanagari:wght@400;700&display=swap", {
    headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0 Safari/537.36" },
  })).text();
  const blocks = [...css.matchAll(/\/\* ([\w-]+) \*\/\s*(@font-face \{[^}]+\})/g)].filter(([, subset]) => subset === "latin" || subset === "devanagari");
  let out = "";
  for (const [, , block] of blocks) {
    const url = block.match(/url\((https:[^)]+)\)/)[1];
    const data = Buffer.from(await (await fetch(url)).arrayBuffer()).toString("base64");
    out += block.replace(url, `data:font/woff2;base64,${data}`) + "\n";
  }
  return out;
}
const fontCss = await fonts();
const index = JSON.parse(await readFile(path.join(FROM, "index.json"), "utf8"));
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
for (const w of index.walkthroughs) {
  for (const lang of ["hi", "en"]) {
    const names = Object.keys(w.variants).filter((v) => v.endsWith(`-${lang}`));
    if (!names.length) continue;
    const variants = {}, pictures = {};
    for (const v of names) {
      const m = JSON.parse(await readFile(path.join(FROM, w.journey, v, "manifest.json"), "utf8"));
      variants[v] = m;
      for (const f of await readdir(path.join(FROM, w.journey, v)))
        if (f.endsWith(".webp")) pictures[`${v}/${f}`] = `data:image/webp;base64,${(await readFile(path.join(FROM, w.journey, v, f))).toString("base64")}`;
    }
    const title = `${w.title[lang] ?? w.title.en} · UPYOG Uttarakhand`;
    const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/</g, "&lt;")}</title><style>${fontCss}${css}</style></head><body><div id="root"></div>
<script>window.__WALKTHROUGH__=${safe(JSON.stringify({ variants, pictures }))};</script>
<script type="module">${safe(js)}</script></body></html>`;
    const file = path.join(OUT, `${w.journey}.${lang}.html`);
    await writeFile(file, html);

    // Proof that it needs no network: everything but the file itself is refused.
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(/^https?:/, (r) => r.abort());
    await page.goto(`file://${file}`);
    await page.getByTestId("player").waitFor({ timeout: 10_000 });
    const pic = await page.locator('[data-testid="stage"] img').first().evaluate((i) => i.complete && i.naturalWidth > 0);
    if (errors.length || !pic) throw new Error(`${path.basename(file)} does not play offline: ${errors.join("; ") || "no picture"}`);
    await page.close();
    console.log(`${path.relative(process.cwd(), file)}: ${(html.length / 1048576).toFixed(1)} MB, ${names.join(" + ")}, plays offline`);
  }
}
await browser.close();
