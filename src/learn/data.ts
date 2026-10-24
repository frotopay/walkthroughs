// Where the walkthroughs are: index.json and, per walkthrough and variant, a manifest and its pictures
// (e2e/tools/publish-learn.mjs writes them). VITE_LEARN_URL points elsewhere, as the bucket of a release will.
import type { Device, Index, Lang, Manifest } from "./types";

export const LEARN_URL = ((import.meta.env.VITE_LEARN_URL as string | undefined) ?? "/walkthroughs").replace(/\/$/, "");

async function json<T>(path: string): Promise<T> {
  const r = await fetch(`${LEARN_URL}/${path}`);
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return (await r.json()) as T;
}

export const getIndex = () => json<Index>("index.json");
export const getManifest = (journey: string, variant: string) => json<Manifest>(`${journey}/${variant}/manifest.json`);
export const pictureOf = (journey: string, variant: string) => (file: string) => `${LEARN_URL}/${journey}/${variant}/${file}`;

/** The variant to show: this device and language if there is one, else this language, else whatever there is. */
export function pickVariant(variants: string[], device: Device, lang: Lang): string | undefined {
  return variants.find((v) => v === `${device}-${lang}`) ?? variants.find((v) => v.endsWith(`-${lang}`)) ?? variants[0];
}
