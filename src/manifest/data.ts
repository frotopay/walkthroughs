// Where the walkthroughs are: index.json and, per walkthrough and variant, a manifest and its pictures
// (`walkthroughs publish` writes them), under one base URL: a folder the app serves, or a bucket.
import type { Device, Index, Lang, Manifest } from "./types.js";

export type Loader = {
  getIndex: () => Promise<Index>;
  getManifest: (journey: string, variant: string) => Promise<Manifest>;
  /** A variant's pictures, by file name, as URLs. */
  pictureOf: (journey: string, variant: string) => (file: string) => string;
};

export function loader(base: string): Loader {
  const root = base.replace(/\/$/, "");
  async function json<T>(path: string): Promise<T> {
    const r = await fetch(`${root}/${path}`);
    if (!r.ok) throw new Error(`${r.status} ${path}`);
    return (await r.json()) as T;
  }
  return {
    getIndex: () => json<Index>("index.json"),
    getManifest: (journey, variant) => json<Manifest>(`${journey}/${variant}/manifest.json`),
    pictureOf: (journey, variant) => (file) => `${root}/${journey}/${variant}/${file}`,
  };
}

/** The variant to show: this device and language if there is one, else this language, else whatever there is. */
export function pickVariant(variants: string[], device: Device, lang: Lang): string | undefined {
  return variants.find((v) => v === `${device}-${lang}`) ?? variants.find((v) => v.endsWith(`-${lang}`)) ?? variants[0];
}
