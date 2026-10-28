// Where the walkthroughs are: a channel, under one base URL (a folder the app serves, or a bucket), as
// `walkthroughs publish` writes it: index.json and, per walkthrough and variant, a manifest; the pictures they name
// are in pics/ beside the channel, shared by every channel.
import type { Device, Index, Lang, Manifest } from "./types.js";

export type Loader = {
  getIndex: () => Promise<Index>;
  getManifest: (journey: string, variant: string) => Promise<Manifest>;
  /** A variant's pictures, by file name, as URLs. */
  pictureOf: (journey: string, variant: string) => (file: string) => string;
};

export type LoaderOptions = {
  /** Where the pictures are, if not in pics/ beside the channel. */
  pics?: string;
};

/** `base` is the channel: `https://learn.example.com/beta`, or `/walkthroughs/latest` for a folder the app serves. */
export function loader(base: string, o: LoaderOptions = {}): Loader {
  const root = base.replace(/\/$/, "");
  const pics = (o.pics ?? `${root.includes("/") ? root.slice(0, root.lastIndexOf("/")) : "."}/pics`).replace(/\/$/, "");
  async function json<T>(path: string): Promise<T> {
    const r = await fetch(`${root}/${path}`);
    if (!r.ok) throw new Error(`${r.status} ${path}`);
    return (await r.json()) as T;
  }
  return {
    getIndex: () => json<Index>("index.json"),
    getManifest: (journey, variant) => json<Manifest>(`${journey}/${variant}/manifest.json`),
    pictureOf: () => (file) => `${pics}/${file}`,
  };
}

/** The variant to show: this device and language if there is one, else this language, else whatever there is. */
export function pickVariant(variants: string[], device: Device, lang: Lang): string | undefined {
  return variants.find((v) => v === `${device}-${lang}`) ?? variants.find((v) => v.endsWith(`-${lang}`)) ?? variants[0];
}
