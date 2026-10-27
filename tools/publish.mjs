// Walkthrough data for the player (plan/WALKTHROUGHS.md §2.3), from captured journeys: every passed manifest under
// e2e/out/<journey>/<project>/ with the pictures it names, and index.json listing the walkthroughs with their titles in
// both languages and the variants (desk/phone × hi/en) each has. Small enough to keep in git:
// - pictures at the screen's own size (a phone's at 1.5×), WebP quality 65;
// - a step's before-screen that looks the same as the step before's after-screen is that same file;
// - files are named by their content, so a capture that changes nothing changes no file.
//
//   node e2e/tools/publish-learn.mjs            → public/walkthroughs (what `vite preview` and the build serve)
//   node e2e/tools/publish-learn.mjs <dir>
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const FROM = path.resolve("e2e/out");
const TO = path.resolve(process.argv[2] ?? "public/walkthroughs");
const PERSONAS = ["citizen", "pt-clerk", "pt-verifier", "pt-approver", "counter"];

/** A picture at the size it is shown, and a small grey copy to tell near-identical screens apart. */
async function encode(file, width) {
  const img = sharp(file);
  const data = await img.clone().resize({ width }).webp({ quality: 65, effort: 6 }).toBuffer();
  const thumb = await img.clone().resize(96, 96, { fit: "fill" }).greyscale().raw().toBuffer();
  return { data, thumb, name: `${createHash("sha256").update(data).digest("hex").slice(0, 16)}.webp` };
}
/** Mean difference of two thumbnails, 0–255: under 1.5 a reader cannot tell them apart. */
const differ = (a, b) => a.reduce((t, v, i) => t + Math.abs(v - b[i]), 0) / a.length;

/** How long a step plays at normal speed: its hold, never under the player's own animation. */
const playMs = (s) => Math.max(s.hold_ms, 3000);

await rm(TO, { recursive: true, force: true });
const walkthroughs = new Map();
for (const journey of (await readdir(FROM)).sort()) {
  for (const project of (await readdir(path.join(FROM, journey)).catch(() => [])).sort()) {
    const dir = path.join(FROM, journey, project);
    const m = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8").catch(() => "null"));
    if (!m || m.status !== "passed") continue;
    const out = path.join(TO, journey, project);
    await mkdir(out, { recursive: true });
    const width = m.device === "phone" ? Math.round(m.viewport.w * 1.5) : m.viewport.w;
    let last = null;
    for (const s of m.steps) {
      for (const key of ["before", "after"]) {
        if (!s[key]) continue;
        const pic = await encode(path.join(dir, s[key]), width);
        if (key === "before" && last && differ(pic.thumb, last.thumb) < 1.5) {
          s[key] = last.name;
          continue;
        }
        await writeFile(path.join(out, pic.name), pic.data);
        s[key] = pic.name;
        last = pic;
      }
    }
    await writeFile(path.join(out, "manifest.json"), JSON.stringify(m));
    const w = walkthroughs.get(journey) ?? { journey, persona: m.persona, title: {}, summary: {}, variants: {} };
    w.title[m.lang] = m.title;
    w.summary[m.lang] = m.summary;
    w.variants[project] = { steps: m.steps.length, ms: m.steps.reduce((t, s) => t + playMs(s), 0), captured: m.captured, app: m.app };
    walkthroughs.set(journey, w);
  }
}
const list = [...walkthroughs.values()].sort((a, b) => PERSONAS.indexOf(a.persona) - PERSONAS.indexOf(b.persona) || a.journey.localeCompare(b.journey));
await mkdir(TO, { recursive: true });
await writeFile(path.join(TO, "index.json"), JSON.stringify({ schema: 1, published: new Date().toISOString(), walkthroughs: list }, null, 2));
console.log(`${list.length} walkthroughs, ${list.reduce((n, w) => n + Object.keys(w.variants).length, 0)} variants → ${path.relative(process.cwd(), TO)}`);
