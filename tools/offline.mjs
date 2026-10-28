// Single offline files of the walkthroughs: one HTML per walkthrough and language, with the player, its styles, the
// desk and phone variants and every picture inside, so it plays from a pen drive in a training room. Each file is
// opened once with the network blocked to prove it needs none.
//
//   walkthroughs offline [--from public/walkthroughs/latest] [--out e2e/out/offline] [--brand "UPYOG Uttarakhand"]
//                        [--personas personas.json] [--css theme.css]
//
// --from is a channel as `walkthroughs publish` wrote it to a folder, with pics/ beside it. --personas names who each
// walkthrough is for ({ "citizen": { "en": …, "hi": … } }); --css is added after the player's styles, to set its
// colours (--color-primary, …) and type.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";

const { values: args } = parseArgs({
  options: {
    from: { type: "string", default: "public/walkthroughs/latest" },
    out: { type: "string", default: "e2e/out/offline" },
    brand: { type: "string", default: "" },
    personas: { type: "string" },
    css: { type: "string" },
  },
});
const FROM = path.resolve(args.from);
const PICS = path.join(FROM, "..", "pics");
const OUT = path.resolve(args.out);
const BUILT = fileURLToPath(new URL("../dist/offline/", import.meta.url));
const js = await readFile(path.join(BUILT, "player.js"), "utf8").catch(() => {
  throw new Error(`no offline player at ${BUILT}: build the package (npm run build)`);
});
const css = (await readFile(path.join(BUILT, "player.css"), "utf8").catch(() => "")) + (args.css ? await readFile(args.css, "utf8") : "");
const personas = args.personas ? JSON.parse(await readFile(args.personas, "utf8")) : {};
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

// PW_CHANNEL=chrome uses the Chrome already installed instead of Playwright's own.
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL });
for (const w of index.walkthroughs) {
  for (const lang of ["hi", "en"]) {
    const names = Object.keys(w.variants).filter((v) => v.endsWith(`-${lang}`));
    if (!names.length) continue;
    const variants = {}, pictures = {};
    for (const v of names) {
      const m = JSON.parse(await readFile(path.join(FROM, w.journey, v, "manifest.json"), "utf8"));
      variants[v] = m;
      for (const f of new Set(m.steps.flatMap((s) => [s.before, s.after]).filter(Boolean)))
        pictures[`${v}/${f}`] = `data:image/webp;base64,${(await readFile(path.join(PICS, f))).toString("base64")}`;
    }
    const title = [w.title[lang] ?? w.title.en, args.brand].filter(Boolean).join(" · ");
    const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/</g, "&lt;")}</title><style>${fontCss}${css}</style></head><body><div id="root"></div>
<script>window.__WALKTHROUGH__=${safe(JSON.stringify({ variants, pictures, persona: personas[w.persona] }))};</script>
<script type="module">${safe(js)}</script></body></html>`;
    const file = path.join(OUT, `${w.journey}.${lang}.html`);
    await writeFile(file, html);

    // Proof that it needs no network: everything but the file itself is refused.
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(/^https?:/, (r) => r.abort());
    await page.goto(pathToFileURL(file).href);
    await page.getByTestId("player").waitFor({ timeout: 10_000 });
    const pic = await page.locator('[data-testid="stage"] img').first().evaluate((i) => i.complete && i.naturalWidth > 0);
    if (errors.length || !pic) throw new Error(`${path.basename(file)} does not play offline: ${errors.join("; ") || "no picture"}`);
    await page.close();
    console.log(`${path.relative(process.cwd(), file)}: ${(html.length / 1048576).toFixed(1)} MB, ${names.join(" + ")}, plays offline`);
  }
}
await browser.close();
