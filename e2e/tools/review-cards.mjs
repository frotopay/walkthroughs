// Review cards from captured walkthroughs: one image per step with its title and caption, the screen before the action
// with the target ringed where the manifest says, and the screen after it. What the Sonnet reviewers read
// (plan/WALKTHROUGHS.md §3), and a first look at how the player and the PDF will draw a step.
//
//   node e2e/tools/review-cards.mjs                      every manifest under e2e/out
//   node e2e/tools/review-cards.mjs register-property    one journey
import { readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const ROOT = path.resolve("e2e/out");
const only = process.argv[2];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const pct = (v) => `${(v * 100).toFixed(2)}%`;

function page(m) {
  const phone = m.device === "phone";
  const cards = m.steps.map((s) => {
    const ring = s.box
      ? `<div class="ring" style="left:${pct(s.box.x)};top:${pct(s.box.y)};width:${pct(s.box.w)};height:${pct(s.box.h)}"></div>`
      : "";
    const action = [s.action.verb, s.action.target, s.action.value && `“${s.action.value}”`].filter(Boolean).join(" · ");
    const before = s.before
      ? `<figure><div class="frame"><img src="../${s.before}">${ring}</div><figcaption>before${s.box ? "" : " · no target"}</figcaption></figure>`
      : `<figure class="none"><div class="frame empty">no before-screen (${esc(s.action.verb)})</div></figure>`;
    const chapter = m.chapters.find((c) => c.id === s.chapter)?.title ?? "";
    return `<section class="card" id="s${s.n}">
      <header><span class="n">${s.n}</span><span class="ch">${esc(chapter)}</span><b>${esc(s.title)}</b></header>
      <p class="say">${esc(s.say)}</p>
      <p class="act">${esc(action)} · ${esc(s.url)} · hold ${s.hold_ms} ms${s.checks.length ? ` · checks: ${s.checks.map((c) => esc(c.name)).join("; ")}` : ""}</p>
      <div class="shots">${before}<figure><div class="frame"><img src="../${s.after}"></div><figcaption>after</figcaption></figure></div>
    </section>`;
  });
  return `<!doctype html><html lang="${m.lang}"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&family=Noto+Sans+Devanagari:wght@400;600;700&display=block">
<style>
  body { margin: 0; background: #e2e8f0; font-family: "Noto Sans", "Noto Sans Devanagari", sans-serif; }
  .card { width: ${phone ? 860 : 1640}px; background: #fff; margin: 0 0 24px; padding: 20px 24px; box-sizing: border-box; }
  header { display: flex; align-items: baseline; gap: 12px; font-size: 22px; }
  .n { background: #4338ca; color: #fff; border-radius: 999px; min-width: 34px; text-align: center; font-weight: 700; padding: 2px 8px; }
  .ch { color: #64748b; font-size: 15px; text-transform: uppercase; letter-spacing: .04em; }
  .say { font-size: 20px; margin: 10px 0 4px; color: #0f172a; }
  .act { font-size: 12px; color: #64748b; margin: 0 0 12px; word-break: break-all; }
  .shots { display: flex; gap: 16px; }
  figure { margin: 0; flex: 1; }
  .frame { position: relative; overflow: hidden; border: 1px solid #cbd5e1; }
  .frame img { display: block; width: 100%; }
  .frame.empty { aspect-ratio: ${m.viewport.w} / ${m.viewport.h}; display: grid; place-items: center; color: #94a3b8; }
  .ring { position: absolute; border: 3px solid #e11d48; border-radius: 8px; box-shadow: 0 0 0 4000px rgba(15,23,42,.25); }
  figcaption { font-size: 13px; color: #64748b; margin-top: 4px; }
</style></head><body>${cards.join("")}</body></html>`;
}

const browser = await chromium.launch();
const context = await browser.newContext({ deviceScaleFactor: 1 });
const tab = await context.newPage();
let made = 0;
for (const journey of await readdir(ROOT)) {
  if (only && journey !== only) continue;
  for (const project of await readdir(path.join(ROOT, journey)).catch(() => [])) {
    const dir = path.join(ROOT, journey, project);
    const m = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8").catch(() => "null"));
    if (!m) continue;
    const out = path.join(dir, "review");
    await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, "cards.html"), page(m));
    await tab.goto(`file://${path.join(out, "cards.html")}`);
    await tab.evaluate(() => document.fonts.ready);
    await tab.waitForFunction(() => [...document.images].every((i) => i.complete));
    for (const s of m.steps) {
      await tab.locator(`#s${s.n}`).screenshot({ path: path.join(out, `${String(s.n).padStart(2, "0")}.png`) });
      made++;
    }
    console.log(`${journey}/${project}: ${m.steps.length} cards`);
  }
}
await browser.close();
console.log(`${made} cards`);
