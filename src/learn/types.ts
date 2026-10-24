// A walkthrough as the journeys record it (e2e/lib/guide.ts, manifest schema 1) and as e2e/tools/publish-learn.mjs
// lists them (index.json).

export type Lang = "hi" | "en";
export type Device = "desk" | "phone";
export type Box = { x: number; y: number; w: number; h: number };
export type Verb = "goto" | "click" | "fill" | "select" | "check" | "look" | "upload";

export type Step = {
  id: string;
  n: number;
  chapter: string | null;
  title: string;
  say: string;
  action: { verb: Verb; target?: string; value?: string };
  /** Fractions of the screen; on the before-screen, or for a goto on the screen it arrives at. */
  box?: Box;
  box_on?: "after";
  url: string;
  before?: string;
  after?: string;
  hold_ms: number;
  checks: { name: string; ok: boolean }[];
};

export type Manifest = {
  schema: 1;
  journey: string;
  persona: string;
  project: string;
  lang: Lang;
  device: Device;
  viewport: { w: number; h: number; dpr: number };
  app: { web: string; api: string };
  captured: string;
  status: "passed" | "failed";
  title: string;
  summary: string;
  chapters: { id: string; title: string }[];
  steps: Step[];
};

export type L10n = { en?: string; hi?: string };
export type IndexEntry = {
  journey: string;
  persona: string;
  title: L10n;
  summary: L10n;
  variants: Record<string, { steps: number; ms: number; captured: string }>;
};
export type Index = { schema: 1; published: string; walkthroughs: IndexEntry[] };

export const variant = (device: Device, lang: Lang) => `${device}-${lang}`;
