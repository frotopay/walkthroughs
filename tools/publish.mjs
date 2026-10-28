// Walkthrough data for the player, from captured journeys: every passed manifest under <from>/<journey>/<project>/
// with the pictures it names, and index.json listing the walkthroughs with their titles in both languages and the
// variants (desk/phone × hi/en) each has:
// - pictures at the screen's own size (a phone's at 1.5×), WebP quality 65;
// - a step's before-screen that looks the same as the step before's after-screen is that same file;
// - files are named by their content, so a capture that changes nothing changes no file.
//
//   walkthroughs publish [--from e2e/out] (--to public/walkthroughs | --r2 <bucket>) [--channel latest]
//                        [--order citizen,clerk,… | --personas personas.json]
//
// A folder and a bucket hold the same layout:
//   pics/<hash>.webp                                 every picture, shared by every channel; never changes
//   <channel>/index.json                             what the player lists
//   <channel>/<journey>/<variant>/manifest.json      one walkthrough in one language on one screen
// The app reads a channel (`loader(".../<channel>")`); a channel is a line of releases, such as `beta`.
//
// To R2 (S3 API; R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY): only pictures not already in pics/ are sent,
// then the manifests, then index.json last, so a reader never gets an index naming a file not yet there.
//
// --order lists personas in the order the index shows them, or --personas takes that order from the keys of the file
// that names them (as `walkthroughs offline --personas` reads it); others follow, by name.
import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";

const { values: args } = parseArgs({
  options: {
    from: { type: "string", default: "e2e/out" },
    to: { type: "string" },
    r2: { type: "string" },
    channel: { type: "string", default: "latest" },
    order: { type: "string", default: "" },
    personas: { type: "string" },
  },
});
if (!!args.to === !!args.r2) throw new Error("publish to a folder (--to <dir>) or to R2 (--r2 <bucket>), one of them");
if (!/^[a-z0-9][a-z0-9._-]*$/i.test(args.channel) || args.channel === "pics") throw new Error(`not a channel name: ${args.channel}`);
const FROM = path.resolve(args.from);
const CHANNEL = args.channel;
const ORDER = args.personas ? Object.keys(JSON.parse(await readFile(args.personas, "utf8"))) : args.order.split(",").filter(Boolean);
const rank = (p) => (ORDER.includes(p) ? ORDER.indexOf(p) : ORDER.length);

const PICTURE = { type: "image/webp", cache: "public, max-age=31536000, immutable" };
const JSON_ = { type: "application/json", cache: "public, max-age=300" };

/** A folder: the channel's own files are written afresh; pictures already there stay. */
async function folder(dir) {
  const root = path.resolve(dir);
  await rm(path.join(root, CHANNEL), { recursive: true, force: true });
  return {
    where: path.relative(process.cwd(), path.join(root, CHANNEL)) || ".",
    has: (key) => access(path.join(root, key)).then(() => true, () => false),
    async put(key, body) {
      await mkdir(path.dirname(path.join(root, key)), { recursive: true });
      await writeFile(path.join(root, key), body);
    },
  };
}

/** An R2 bucket through its S3 API. A channel's manifests are overwritten; old ones no index names are left. */
async function r2(bucket) {
  // R2_ENDPOINT stands in for the account's endpoint, to try it against another S3 API.
  const need = [process.env.R2_ENDPOINT ? "" : "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"].filter((k) => k && !process.env[k]);
  if (need.length) throw new Error(`publishing to R2 needs ${need.join(", ")}`);
  const { AwsClient } = await import("aws4fetch");
  const s3 = new AwsClient({ accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
  const base = `${process.env.R2_ENDPOINT ?? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`}/${bucket}`;
  async function call(url, init) {
    const r = await s3.fetch(url, init);
    if (!r.ok) throw new Error(`R2 ${init?.method ?? "GET"} ${url.replace(base, bucket)}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    return r;
  }
  // The pictures already there, so a run sends only new ones.
  const there = new Set();
  for (let token = ""; ; ) {
    const xml = await (await call(`${base}?list-type=2&prefix=pics/${token && `&continuation-token=${encodeURIComponent(token)}`}`)).text();
    for (const [, key] of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) there.add(key);
    token = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] ?? "";
    if (!token) break;
  }
  return {
    where: `r2://${bucket}/${CHANNEL} (${there.size} pictures there before)`,
    has: async (key) => there.has(key),
    async put(key, body, kind) {
      await call(`${base}/${key}`, { method: "PUT", body, headers: { "Content-Type": kind.type, "Cache-Control": kind.cache } });
      there.add(key);
    },
  };
}

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

const store = args.to ? await folder(args.to) : await r2(args.r2);
const walkthroughs = new Map();
const manifests = [];
let sent = 0;
for (const journey of (await readdir(FROM)).sort()) {
  for (const project of (await readdir(path.join(FROM, journey)).catch(() => [])).sort()) {
    const dir = path.join(FROM, journey, project);
    const m = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8").catch(() => "null"));
    if (!m || m.status !== "passed") continue;
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
        if (!(await store.has(`pics/${pic.name}`))) {
          await store.put(`pics/${pic.name}`, pic.data, PICTURE);
          sent++;
        }
        s[key] = pic.name;
        last = pic;
      }
    }
    manifests.push([`${CHANNEL}/${journey}/${project}/manifest.json`, JSON.stringify(m)]);
    const w = walkthroughs.get(journey) ?? { journey, persona: m.persona, ...(m.module ? { module: m.module } : {}), title: {}, summary: {}, variants: {} };
    w.title[m.lang] = m.title;
    w.summary[m.lang] = m.summary;
    w.variants[project] = { steps: m.steps.length, ms: m.steps.reduce((t, s) => t + playMs(s), 0), captured: m.captured, app: m.app };
    walkthroughs.set(journey, w);
  }
}
for (const [key, body] of manifests) await store.put(key, body, JSON_);
const list = [...walkthroughs.values()].sort((a, b) => rank(a.persona) - rank(b.persona) || a.persona.localeCompare(b.persona) || a.journey.localeCompare(b.journey));
await store.put(`${CHANNEL}/index.json`, JSON.stringify({ schema: 1, published: new Date().toISOString(), walkthroughs: list }, null, 2), JSON_);
console.log(`${list.length} walkthroughs, ${manifests.length} variants, ${sent} new pictures → ${store.where}`);
