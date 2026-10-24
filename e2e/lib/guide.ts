// The step recorder (plan/WALKTHROUGHS.md §2.1–2.2). A journey takes each user action through it. In test mode it only
// acts and checks; with CAPTURE=1 it also keeps, per step, a clean screenshot before the action, the target's box, the
// action and the caption in the project's language, and a screenshot after it, then writes manifest.json for the
// walkthrough player and the PDF manual.
import { execSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Locator, type Page, type Request } from "@playwright/test";
import sharp from "sharp";

export type Lang = "hi" | "en";
export type L10n = { en: string; hi: string };
/** A journey's words, kept beside it: the walkthrough's title, its chapters, and each step's title and caption. */
export type Captions = {
  journey: string;
  persona: string;
  title: L10n;
  summary: L10n;
  chapters: Record<string, L10n>;
  steps: Record<string, { title: L10n; say: L10n }>;
};

type Box = { x: number; y: number; w: number; h: number };
type Verb = "goto" | "click" | "fill" | "select" | "check" | "look";
type Step = {
  id: string; n: number; chapter: string | null; title: string; say: string;
  action: { verb: Verb; target?: string; value?: string };
  /** The ring: on the before-screen, or for a goto on the screen it arrives at (box_on "after"). */
  box?: Box; box_on?: "after"; url: string; before?: string; after?: string; hold_ms: number;
  checks: { name: string; ok: boolean }[];
};
type Opts = {
  /** What must be true once the action is done; the after-shot waits for it. */
  then?: () => Promise<unknown>;
  /** A point in the target to act on (a map), in CSS pixels from its top left. */
  at?: { x: number; y: number };
  /** For a goto: what to ring on the screen it arrives at. */
  show?: Locator;
};

export const ROOT = path.resolve("e2e/out");
let commit: string | undefined;
function webCommit(): string {
  if (commit === undefined) {
    try {
      const head = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
      commit = execSync("git status --porcelain -- src", { encoding: "utf8" }).trim() ? `${head}+changes` : head;
    } catch {
      commit = "unknown";
    }
  }
  return commit;
}

/** Problems with a journey's words: a language missing anywhere. */
export function captionProblems(c: Captions): string[] {
  const out: string[] = [];
  const both = (where: string, l: L10n | undefined) => {
    if (!l?.en?.trim() || !l?.hi?.trim()) out.push(`${c.journey}: ${where} needs English and Hindi`);
  };
  both("title", c.title);
  both("summary", c.summary);
  for (const [k, v] of Object.entries(c.chapters)) both(`chapter ${k}`, v);
  for (const [k, v] of Object.entries(c.steps)) {
    both(`step ${k} title`, v.title);
    both(`step ${k} caption`, v.say);
  }
  return out;
}

const round = (v: number) => Math.round(Math.min(Math.max(v, 0), 1) * 10_000) / 10_000;

export class Guide<C extends Captions> {
  private steps: Step[] = [];
  private chapterId: string | null = null;
  private chapters: string[] = [];
  private started = false;
  private inflight = new Set<Request>();
  readonly dir: string;

  constructor(
    readonly page: Page,
    readonly c: C,
    readonly o: { lang: Lang; device: string; project: string; capture: boolean; dpr: number },
  ) {
    const problems = captionProblems(c);
    if (problems.length) throw new Error(problems.join("\n"));
    this.dir = path.join(ROOT, c.journey, o.project);
    page.on("request", (r) => this.inflight.add(r));
    page.on("requestfinished", (r) => this.inflight.delete(r));
    page.on("requestfailed", (r) => this.inflight.delete(r));
  }

  chapter(id: keyof C["chapters"] & string) {
    this.chapterId = id;
    if (!this.chapters.includes(id)) this.chapters.push(id);
  }

  goto(id: keyof C["steps"] & string, url: string, opts: Opts = {}) {
    return this.act(id, "goto", undefined, async () => void (await this.page.goto(url)), opts, url);
  }
  click(id: keyof C["steps"] & string, target: Locator, opts: Opts = {}) {
    return this.act(id, "click", target, () => target.click(opts.at ? { position: opts.at } : undefined), opts);
  }
  fill(id: keyof C["steps"] & string, target: Locator, value: string, opts: Opts = {}) {
    return this.act(id, "fill", target, () => target.fill(value), opts, value);
  }
  select(id: keyof C["steps"] & string, target: Locator, value: string, opts: Opts = {}) {
    return this.act(id, "select", target, async () => void (await target.selectOption(value)), opts, value);
  }
  check(id: keyof C["steps"] & string, target: Locator, opts: Opts = {}) {
    return this.act(id, "check", target, () => target.check(), opts);
  }
  /** A step with nothing to do but look: the target is shown and explained. */
  look(id: keyof C["steps"] & string, target?: Locator, opts: Opts = {}) {
    return this.act(id, "look", target, async () => {}, opts);
  }

  /** A check that must hold, recorded on the last step for the QA report. */
  async verify(name: string, fn: () => Promise<unknown>) {
    await fn();
    this.steps.at(-1)?.checks.push({ name, ok: true });
  }

  private async act(id: string, verb: Verb, target: Locator | undefined, perform: () => Promise<unknown>, opts: Opts, value?: string) {
    const cap = this.c.steps[id];
    if (!cap) throw new Error(`${this.c.journey}: no caption for step ${id}`);
    const { lang, capture } = this.o;
    const step: Step = {
      id, n: this.steps.length + 1, chapter: this.chapterId, title: cap.title[lang], say: cap.say[lang],
      action: { verb, ...(target ? { target: String(target) } : {}), ...(value !== undefined ? { value } : {}) },
      url: "", checks: [],
      // Long enough to read the caption: Hindi about 12 characters a second, English about 15, never under 2.5 s.
      hold_ms: Math.max(2500, Math.round((cap.say[lang].length / (lang === "hi" ? 12 : 15)) * 1000)),
    };
    const name = String(step.n).padStart(2, "0");
    if (target) await this.bringIntoView(target);
    if (capture && verb !== "goto") {
      await this.settle();
      [step.box, step.before] = await this.ringed(name, target, opts.at);
    }
    await perform();
    if (opts.then) await opts.then();
    if (verb === "select" && target) step.action.value = (await target.locator("option:checked").textContent())?.trim() ?? value;
    if (opts.show) await this.bringIntoView(opts.show);
    if (capture) {
      await this.settle();
      if (verb === "goto" && opts.show) {
        [step.box, step.after] = await this.ringed(`${name}-after`, opts.show);
        step.box_on = "after";
      } else step.after = await this.shot(`${name}-after`);
    }
    step.url = new URL(this.page.url()).pathname;
    this.steps.push(step);
  }

  /** Centred, so a sticky header never covers it and the picture shows what is around it; a target taller than most of
   *  the screen (a card to read) instead starts just below the sticky header, so its heading shows. */
  private async bringIntoView(target: Locator) {
    await expect(target).toBeVisible();
    await target.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const header = [...document.querySelectorAll("header")].find((h) => ["sticky", "fixed"].includes(getComputedStyle(h).position));
      const top = header?.getBoundingClientRect().bottom ?? 0;
      // Already in full view: leave the screen as the person has it.
      if (r.top >= top && r.bottom <= window.innerHeight) return;
      if (r.height < window.innerHeight * 0.6) return el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      window.scrollBy({ top: r.top - top - 16, behavior: "instant" });
    });
  }

  /** The screen as a person would see it once it is still: no request in flight for 400 ms (a single-page app never
   *  goes back to the browser's "network idle"), nothing loading (aria-busy, unfinished images), no scrolling, fonts in. */
  private async settle() {
    // The pointer off the page, so no hover tooltip or hover colour is pictured.
    await this.page.mouse.move(0, 0);
    const deadline = Date.now() + 10_000;
    let quiet = Date.now();
    while (Date.now() < deadline) {
      if (this.inflight.size > 0) quiet = Date.now();
      else if (Date.now() - quiet >= 400) break;
      await this.page.waitForTimeout(50);
    }
    await this.page
      .waitForFunction(() => !document.querySelector('[aria-busy="true"]') && [...document.images].every((i) => i.complete), undefined, { timeout: 10_000 })
      .catch(() => {});
    await this.page.evaluate(async () => {
      let y = -1;
      for (let i = 0; i < 40 && y !== window.scrollY; i++) {
        y = window.scrollY;
        await new Promise((r) => setTimeout(r, 150));
      }
      await document.fonts.ready;
    });
  }

  /** A screenshot with the target's box, taken again if the layout moved while it was taken. */
  private async ringed(name: string, target?: Locator, at?: { x: number; y: number }): Promise<[Box | undefined, string]> {
    let box = target ? await this.box(target, at) : undefined;
    for (let i = 0; ; i++) {
      const file = await this.shot(name);
      const again = target ? await this.box(target, at) : undefined;
      if (JSON.stringify(again) === JSON.stringify(box) || i === 2) return [again, file];
      box = again;
      await this.settle();
    }
  }

  private async box(target: Locator, at?: { x: number; y: number }): Promise<Box | undefined> {
    // A radio button or checkbox is shown by its whole label: that is what the reader looks for and clicks. The box is
    // taken against the visual viewport, which is what a screenshot shows; on a phone it can sit apart from the layout
    // viewport that getBoundingClientRect measures in.
    const { b, vp } = await target.evaluate((el) => {
      const small = el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox");
      const r = ((small && el.closest("label")) || el).getBoundingClientRect();
      const v = window.visualViewport;
      const [ox, oy, w, h] = v ? [v.offsetLeft, v.offsetTop, v.width, v.height] : [0, 0, window.innerWidth, window.innerHeight];
      return { b: { x: r.x - ox, y: r.y - oy, width: r.width, height: r.height }, vp: { width: w, height: h } };
    });
    const r = at ? { x: b.x + at.x - 14, y: b.y + at.y - 14, width: 28, height: 28 } : b;
    // Within the screen: a target taller than the screen is shown by the part in view.
    const x0 = Math.max(r.x, 0), y0 = Math.max(r.y, 0);
    const x1 = Math.min(r.x + r.width, vp.width), y1 = Math.min(r.y + r.height, vp.height);
    return { x: round(x0 / vp.width), y: round(y0 / vp.height), w: round((x1 - x0) / vp.width), h: round((y1 - y0) / vp.height) };
  }

  private async shot(name: string): Promise<string> {
    if (!this.started) {
      await rm(this.dir, { recursive: true, force: true });
      await mkdir(this.dir, { recursive: true });
      this.started = true;
    }
    const png = await this.page.screenshot({ animations: "disabled", caret: "hide" });
    const file = `${name}.webp`;
    await sharp(png).webp({ quality: 80 }).toFile(path.join(this.dir, file));
    return file;
  }

  /** Writes the manifest (capture mode). A passed journey must have used every caption it has. */
  async finish(status: "passed" | "failed") {
    if (status === "passed") {
      const used = new Set(this.steps.map((s) => s.id));
      const unused = Object.keys(this.c.steps).filter((k) => !used.has(k));
      if (unused.length) throw new Error(`${this.c.journey}: captions no step uses: ${unused.join(", ")}`);
    }
    if (!this.o.capture || !this.started) return;
    const vp = this.page.viewportSize();
    const { lang, device, project, dpr } = this.o;
    const manifest = {
      schema: 1,
      journey: this.c.journey,
      persona: this.c.persona,
      project, lang, device,
      viewport: { w: vp?.width, h: vp?.height, dpr },
      app: { web: webCommit(), api: process.env.E2E_API_URL ?? "https://api.udduk.com" },
      captured: new Date().toISOString(),
      status,
      title: this.c.title[lang],
      summary: this.c.summary[lang],
      chapters: this.chapters.map((id) => ({ id, title: this.c.chapters[id][lang] })),
      steps: this.steps,
    };
    await writeFile(path.join(this.dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  }
}
