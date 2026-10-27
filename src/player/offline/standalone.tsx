// The player on its own, for a single offline file (`walkthroughs offline`): the walkthrough's variants, their
// pictures and the name of who it is for are in the page itself (window.__WALKTHROUGH__), so it plays with no network,
// as in a training room.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import Player from "../Player";
import type { Device, Lang, Manifest } from "../../manifest/types";
import "./offline.css";

type Embedded = { variants: Record<string, Manifest>; pictures: Record<string, string>; persona?: Partial<Record<Lang, string>> };
const data = (window as unknown as { __WALKTHROUGH__: Embedded }).__WALKTHROUGH__;
const names = Object.keys(data.variants);

function Offline() {
  const [v, setV] = useState(names.find((n) => n.startsWith(window.innerWidth < 640 ? "phone" : "desk")) ?? names[0]);
  const [start, setStart] = useState(0);
  const m = data.variants[v];
  document.documentElement.lang = m.lang;
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{data.persona?.[m.lang] ?? m.persona}</p>
      <h1 className="text-2xl font-bold tracking-tight text-text">{m.title}</h1>
      <p className="mb-5 mt-1 max-w-3xl text-sm text-text-secondary">{m.summary}</p>
      <Player key={v} manifest={m} src={(f) => data.pictures[`${v}/${f}`]} variants={names} start={start}
        onVariant={(lang: Lang, device: Device, id: string) => {
          const to = `${device}-${lang}`;
          setStart(Math.max(data.variants[to].steps.findIndex((s) => s.id === id), 0));
          setV(to);
        }} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Offline /></StrictMode>);
