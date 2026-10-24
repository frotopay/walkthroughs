// The walkthrough player (plan/WALKTHROUGHS.md §2.3): one step at a time, moving like a video. Each step shows the
// screen before the action; a cursor glides to the control while the rest of the screen dims; a fill types itself in;
// a click ripples; the screen cross-fades to what came of it; it holds long enough to read the caption, then the next
// step begins. Play, pause, back, next, chapters, speed, practice mode (stop after each step), the language and the
// screen switch in place, and keys. It takes everything as props, so the app and the offline file share it.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, ListOrdered, Monitor, Pause, Play, RotateCcw, Smartphone, X } from "lucide-react";
import type { Box, Device, Lang, Manifest, Step } from "./types";
import { WORDS } from "./words";

type Phase = "enter" | "aim" | "act" | "after" | "hold";
const ORDER: Phase[] = ["enter", "aim", "act", "after", "hold"];
const SPEEDS = [0.75, 1, 1.5];

export type PlayerProps = {
  manifest: Manifest;
  /** A picture of the manifest, by its file name, as a URL. */
  src: (file: string) => string;
  /** The variants there are of this walkthrough ("desk-hi", "phone-en", …). */
  variants: string[];
  /** Another language or screen, at the same step. */
  onVariant?: (lang: Lang, device: Device, stepId: string) => void;
  /** The step to open at (0-based). */
  start?: number;
  onStep?: (index: number) => void;
  /** Where the real screen of a step is, when it is safe to open. */
  tryUrl?: (step: Step) => string | null;
  autoplay?: boolean;
};

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** What a step does, phase by phase, in milliseconds at normal speed. */
function timeline(s: Step, quick: boolean): Partial<Record<Phase, number>> {
  const v = s.action.verb;
  const enter = quick ? 150 : 350;
  const aim = quick ? 150 : 750;
  if (v === "goto" || !s.before) {
    const t = { enter, aim: s.box ? aim : 0 };
    return { ...t, hold: Math.max(s.hold_ms - t.enter - t.aim, 1200) };
  }
  if (v === "look") return { enter, aim, hold: Math.max(s.hold_ms - enter - aim, 1500) };
  const act = quick ? 150 : v === "fill" || v === "select" ? Math.min(1800, 120 + (s.action.value ?? "").length * 55) : 450;
  const after = quick ? 150 : 450;
  return { enter, aim, act, after, hold: Math.max(s.hold_ms - enter - aim - act - after, 1200) };
}

/** Where a step rests when you go to it rather than play into it: the moment just before the action. */
function keyFrame(s: Step): Phase {
  if (s.action.verb === "goto" || !s.before) return "hold";
  return s.action.verb === "look" ? "hold" : "aim";
}

const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

export default function Player({ manifest: m, src, variants, onVariant, start = 0, onStep, tryUrl, autoplay = false }: PlayerProps) {
  const w = WORDS[m.lang];
  const steps = m.steps;
  const quick = useMemo(reducedMotion, []);
  const [i, setI] = useState(Math.min(Math.max(start, 0), steps.length - 1));
  const [phase, setPhase] = useState<Phase>(() => keyFrame(steps[Math.min(Math.max(start, 0), steps.length - 1)]));
  const [playing, setPlaying] = useState(autoplay);
  const [speed, setSpeed] = useState(1);
  const [practice, setPractice] = useState(false);
  const [ended, setEnded] = useState(false);
  // In practice mode, this step has played and waits for Next.
  const [waiting, setWaiting] = useState(false);
  const [list, setList] = useState(false);
  const step = steps[i];
  const plan = useMemo(() => timeline(step, quick), [step, quick]);

  useEffect(() => { onStep?.(i); }, [i, onStep]);

  // Elapsed and total time, as a video shows them: the steps before this one, and this one as far as it has played.
  const lengths = useMemo(() => steps.map((s) => Object.values(timeline(s, quick)).reduce((a, b) => a + (b ?? 0), 0)), [steps, quick]);
  const total = lengths.reduce((a, b) => a + b, 0) / speed;
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!playing) return;
    setStartedAt(Date.now());
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [playing, i]);
  const before = lengths.slice(0, i).reduce((a, b) => a + b, 0) / speed;
  const elapsed = ended ? total : before + (playing ? Math.min(now - startedAt, lengths[i] / speed) : 0);

  // The clock: each phase lasts its time at the chosen speed, then the next; after the last, the next step, unless
  // practising (then it waits) or at the end.
  useEffect(() => {
    if (!playing) return;
    const phases = ORDER.filter((p) => plan[p] !== undefined && plan[p]! > 0);
    const at = phases.indexOf(phase);
    const ms = (plan[phase] ?? 0) / speed;
    const t = window.setTimeout(() => {
      if (at >= 0 && at < phases.length - 1) return setPhase(phases[at + 1]);
      if (at < 0) return setPhase(phases[0]);
      if (practice) {
        setPlaying(false);
        return setWaiting(true);
      }
      if (i < steps.length - 1) {
        setI(i + 1);
        setPhase("enter");
      } else {
        setPlaying(false);
        setEnded(true);
      }
    }, ms);
    return () => window.clearTimeout(t);
  }, [playing, phase, plan, speed, practice, i, steps.length]);

  // The next pictures, ready before they are needed.
  useEffect(() => {
    for (const s of steps.slice(i + 1, i + 3)) for (const f of [s.before, s.after]) if (f) new Image().src = src(f);
  }, [i, steps, src]);

  const go = useCallback((to: number, play?: boolean) => {
    const n = Math.min(Math.max(to, 0), steps.length - 1);
    setEnded(false);
    setWaiting(false);
    setI(n);
    const keep = play ?? false;
    setPhase(keep ? "enter" : keyFrame(steps[n]));
    setPlaying(keep);
  }, [steps]);

  const toggle = useCallback(() => {
    if (ended) return go(0, true);
    if (waiting) return i < steps.length - 1 ? go(i + 1, true) : go(0, true);
    setPlaying((p) => !p);
  }, [ended, waiting, i, steps.length, go]);
  const next = useCallback(() => go(i + 1, playing || practice), [go, i, playing, practice]);
  const back = useCallback(() => go(i - 1, false), [go, i]);

  // Keys, as video players have them; not while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]") || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === " " || e.key === "k") toggle();
      else if (e.key === "ArrowRight" || e.key === "l") next();
      else if (e.key === "ArrowLeft" || e.key === "j") back();
      else if (e.key === "Home") go(0, false);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, next, back, go]);

  const chapter = m.chapters.find((c) => c.id === step.chapter);
  const has = (lang: Lang, device: Device) => variants.includes(`${device}-${lang}`);
  const doIt = tryUrl?.(step) ?? null;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-6" data-testid="player">
      <div className="min-w-0">
        <Stage m={m} step={step} prev={steps[i - 1]} phase={phase} src={src} quick={quick} />

        <div className="mt-4 min-h-[7.5rem]" aria-live="polite">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {chapter?.title ? `${chapter.title} · ` : ""}{w.step(i + 1, steps.length)}
          </p>
          <h2 className="mt-1 text-xl font-bold text-text" data-testid="step-title">{step.title}</h2>
          <p className="mt-1 text-lg leading-relaxed text-text-secondary" data-testid="step-say">{step.say}</p>
          {ended && (
            <p className="mt-3 inline-flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
              {w.done}
              <button type="button" onClick={() => go(0, true)} className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline cursor-pointer">
                <RotateCcw size={14} /> {w.replay}
              </button>
            </p>
          )}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="min-w-0 flex-1"><Progress m={m} i={i} playing={playing} ms={lengths[i] / speed} onGo={(n) => go(n, false)} /></div>
          <span className="shrink-0 text-xs font-medium tabular-nums text-text-secondary" data-testid="time">{clock(elapsed)} / {clock(total)}</span>
        </div>

        <div className="sticky bottom-0 z-20 -mx-4 mt-3 flex flex-wrap items-center gap-2 border-t border-border bg-surface-alt/95 px-4 py-2 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none" role="toolbar" aria-label={w.steps}>
          <button type="button" onClick={() => go(0, false)} aria-label={w.restart} title={w.restart} className={ICON}><RotateCcw size={18} /></button>
          <button type="button" onClick={back} disabled={i === 0} aria-label={w.back} title={w.back} className={ICON}><ChevronLeft size={22} /></button>
          <button type="button" onClick={toggle} aria-label={playing ? w.pause : w.play} title={playing ? w.pause : w.play} data-testid="play"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-md transition hover:bg-primary-dark cursor-pointer">
            {playing ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
          </button>
          <button type="button" onClick={next} disabled={i === steps.length - 1} aria-label={w.next} title={w.next} className={ICON}><ChevronRight size={22} /></button>
          <button type="button" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])} title={w.speed}
            aria-label={`${w.speed} ${speed}×`} className="h-11 min-w-14 rounded-lg border border-border bg-white px-2 text-sm font-semibold tabular-nums text-text hover:border-primary cursor-pointer">
            {speed}×
          </button>
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm text-text hover:border-primary" title={w.practiceHint}>
            <input type="checkbox" checked={practice} onChange={(e) => setPractice(e.target.checked)} className="accent-[var(--color-primary)]" /> {w.practice}
          </label>
          <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <div className="inline-flex overflow-hidden rounded-lg border border-border" role="group" aria-label={w.language}>
            {(["hi", "en"] as Lang[]).map((l) => (
              <button key={l} type="button" lang={l} disabled={!has(l, m.device) || l === m.lang} aria-pressed={l === m.lang}
                onClick={() => onVariant?.(l, m.device, step.id)}
                className={`h-11 px-3 text-sm font-semibold ${l === m.lang ? "bg-primary text-white" : "bg-white text-text hover:bg-primary-light disabled:text-text-muted disabled:hover:bg-white"} cursor-pointer disabled:cursor-default`}>
                {l === "hi" ? "हिन्दी" : "English"}
              </button>
            ))}
          </div>
          <div className="inline-flex overflow-hidden rounded-lg border border-border" role="group" aria-label={w.device}>
            {(["desk", "phone"] as Device[]).map((d) => (
              <button key={d} type="button" disabled={!has(m.lang, d) || d === m.device} aria-pressed={d === m.device} title={d === "desk" ? w.desk : w.phone}
                aria-label={d === "desk" ? w.desk : w.phone} onClick={() => onVariant?.(m.lang, d, step.id)}
                className={`flex h-11 w-12 items-center justify-center ${d === m.device ? "bg-primary text-white" : "bg-white text-text hover:bg-primary-light disabled:text-text-muted disabled:hover:bg-white"} cursor-pointer disabled:cursor-default`}>
                {d === "desk" ? <Monitor size={17} /> : <Smartphone size={17} />}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setList((s) => !s)} aria-expanded={list} className={`${ICON} lg:hidden`} aria-label={w.steps} title={w.steps}>
            <ListOrdered size={18} />
          </button>
          {doIt && (
            <a href={doIt} target="_blank" rel="noreferrer" className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-primary no-underline hover:border-primary">
              <ExternalLink size={15} /> {w.doIt}
            </a>
          )}
        </div>
        <p className="mt-2 hidden text-xs text-text-muted sm:block">{w.keys}</p>
      </div>

      <Steps m={m} i={i} open={list} onClose={() => setList(false)} onGo={(n) => { go(n, false); setList(false); }} />
    </div>
  );
}

const clock = (ms: number) => {
  const t = Math.round(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

const ICON = "flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-white text-text hover:border-primary hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text cursor-pointer disabled:cursor-default";

/** The screen: the pictures, the zoom toward the target, the dimmed surround and ring, the cursor, the typing, the ripple. */
function Stage({ m, step, prev, phase, src, quick }: { m: Manifest; step: Step; prev?: Step; phase: Phase; src: (f: string) => string; quick: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const o = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    o.observe(ref.current);
    return () => o.disconnect();
  }, []);

  const v = step.action.verb;
  const box = step.box;
  const onAfter = v === "goto" || !step.before || step.box_on === "after";
  const at = ORDER.indexOf(phase);
  const showAfter = onAfter || (v !== "look" && at >= ORDER.indexOf("after"));
  const ring = !!box && (v === "look" || onAfter ? at >= ORDER.indexOf("aim") : phase === "aim" || phase === "act");
  const pointer = !!box && !onAfter && v !== "look" && (phase === "aim" || phase === "act");
  const typing = phase === "act" && (v === "fill" || v === "select") && !!step.action.value && !!box;
  const ripple = phase === "act" && (v === "click" || v === "check" || v === "select") && !!box;

  // Toward a small target, or when a computer's screen is shown small (on a phone), zoom in while acting on it.
  const narrow = m.device === "desk" && width > 0 && width < 640;
  const small = !!box && box.w < 0.22 && box.h < 0.18;
  const resting = !box || !(ring || pointer) || (showAfter && !onAfter);
  const c = box ? centre(box) : { x: 0.5, y: 0.5 };
  // As far as the ring, with a margin, still fits on the screen around its centre.
  const fits = box ? Math.min(c.x / (box.w / 2 + 0.03), (1 - c.x) / (box.w / 2 + 0.03), c.y / (box.h / 2 + 0.03), (1 - c.y) / (box.h / 2 + 0.03)) : 1;
  const wanted = resting ? 1 : narrow ? Math.min(2.4, Math.max(1.7, 0.45 / Math.max(box!.w, 0.12))) : small && m.device === "desk" ? 1.25 : 1;
  const zoom = Math.max(1, Math.min(wanted, fits));
  const target = box ? (v === "fill" ? { x: box.x + Math.min(box.w * 0.25, 0.04), y: c.y } : c) : c;
  const from = prev?.box && prev.box_on !== "after" && prev.action.verb !== "goto" ? centre(prev.box) : { x: 0.82, y: 0.86 };
  const cursorAt = phase === "enter" ? from : target;
  const stageH = width * (m.viewport.h / m.viewport.w);
  const ease = quick ? "0ms" : "650ms";

  const layer: CSSProperties = {
    transform: `scale(${zoom})`,
    transformOrigin: `${c.x * 100}% ${c.y * 100}%`,
    transition: quick ? "none" : "transform 700ms cubic-bezier(.4,0,.2,1)",
  };
  const pct = (b: Box, pad = 0) => ({ left: `${(b.x - pad) * 100}%`, top: `${(b.y - pad * (m.viewport.w / m.viewport.h)) * 100}%`, width: `${(b.w + 2 * pad) * 100}%`, height: `${(b.h + 2 * pad * (m.viewport.w / m.viewport.h)) * 100}%` });

  return (
    <div ref={ref} data-testid="stage"
      className={`relative mx-auto w-full overflow-hidden bg-slate-100 shadow-lg ${m.device === "phone" ? "rounded-[1.75rem] border-[6px] border-slate-800" : "rounded-xl border border-border"}`}
      style={{ aspectRatio: `${m.viewport.w} / ${m.viewport.h}`, maxWidth: `calc((100vh - ${m.device === "phone" ? 17 : 21}rem) * ${m.viewport.w} / ${m.viewport.h})` }}>
      <div className="absolute inset-0" style={layer}>
        {step.before && <img src={src(step.before)} alt="" className="absolute inset-0 h-full w-full select-none" draggable={false} />}
        {step.after && (
          <img src={src(step.after)} alt={step.title} draggable={false}
            className="absolute inset-0 h-full w-full select-none"
            style={{ opacity: showAfter ? 1 : 0, transition: quick ? "none" : "opacity 450ms ease" }} />
        )}
        {box && (
          <div aria-hidden="true" className="pointer-events-none absolute rounded-[10px]"
            style={{
              ...pct(box, 0.006),
              border: "3px solid #F59E0B",
              boxShadow: "0 0 0 9999px rgba(15,23,42,.45), 0 0 0 6px rgba(245,158,11,.25)",
              opacity: ring ? 1 : 0,
              transition: quick ? "none" : "opacity 300ms ease",
            }}>
            <span className="absolute -left-3 -top-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white shadow">{step.n}</span>
          </div>
        )}
        {typing && box && <Typing text={step.action.value!} box={box} heightPx={stageH * box.h} quick={quick} pct={pct(box)} />}
        {ripple && (
          <span aria-hidden="true" className="learn-ripple pointer-events-none absolute h-10 w-10 rounded-full bg-amber-400/60"
            style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }} />
        )}
        <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" className="pointer-events-none absolute drop-shadow-md"
          style={{ left: `${cursorAt.x * 100}%`, top: `${cursorAt.y * 100}%`, opacity: pointer ? 1 : 0, transition: `left ${ease} cubic-bezier(.4,0,.2,1), top ${ease} cubic-bezier(.4,0,.2,1), opacity 200ms` }}>
          <path d="M3 2l7.5 19 2.6-7.4L20.5 11z" fill="#111827" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </div>
      <style>{`.learn-ripple{transform:translate(-50%,-50%) scale(.2);animation:learn-ripple 500ms ease-out forwards}@keyframes learn-ripple{to{transform:translate(-50%,-50%) scale(2.4);opacity:0}}`}</style>
    </div>
  );
}

/** A value typing itself into the field it goes in. */
function Typing({ text, heightPx, quick, pct }: { text: string; box: Box; heightPx: number; quick: boolean; pct: CSSProperties }) {
  const chars = useMemo(() => Array.from(text), [text]);
  const [n, setN] = useState(quick ? chars.length : 0);
  useEffect(() => {
    if (quick) return;
    const t = window.setInterval(() => setN((k) => (k >= chars.length ? k : k + 1)), 55);
    return () => window.clearInterval(t);
  }, [chars, quick]);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute flex items-center overflow-hidden rounded-md bg-white px-[0.6em] text-text"
      style={{ ...pct, fontSize: `${Math.max(8, Math.min(heightPx * 0.42, 22))}px` }}>
      <span className="truncate">{chars.slice(0, n).join("")}</span>
      <span className="ml-px inline-block h-[1.1em] w-px animate-pulse bg-text" />
    </div>
  );
}

/** The road through the walkthrough: a segment per step, grouped by chapter. */
function Progress({ m, i, playing, ms, onGo }: { m: Manifest; i: number; playing: boolean; ms: number; onGo: (n: number) => void }) {
  return (
    <div className="flex gap-1" data-testid="progress">
      {m.steps.map((s, k) => {
        const chapterStart = k === 0 || m.steps[k - 1].chapter !== s.chapter;
        return (
          <button key={s.id} type="button" onClick={() => onGo(k)} aria-label={`${s.n}. ${s.title}`} title={`${s.n}. ${s.title}`} aria-current={k === i ? "step" : undefined}
            className={`group relative flex h-7 flex-1 cursor-pointer items-center ${chapterStart && k > 0 ? "ml-1.5" : ""}`}>
            <span className="block h-1.5 w-full overflow-hidden rounded-full bg-border group-hover:bg-slate-300">
              <span key={`${k}-${i}-${playing}`} className="block h-full rounded-full bg-primary"
                style={k < i ? { width: "100%" } : k > i ? { width: 0 } : playing
                  ? { width: "100%", animation: `learn-fill ${ms}ms linear` }
                  : { width: "35%" }} />
            </span>
          </button>
        );
      })}
      <style>{"@keyframes learn-fill{from{width:0}to{width:100%}}"}</style>
    </div>
  );
}

/** Chapters and their steps beside the screen; on a phone, a sheet opened from the toolbar. */
function Steps({ m, i, open, onClose, onGo }: { m: Manifest; i: number; open: boolean; onClose: () => void; onGo: (n: number) => void }) {
  const w = WORDS[m.lang];
  const current = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLElement>(null);
  // The current step in view within the list only; scrollIntoView would scroll the page as well.
  useEffect(() => {
    const el = current.current, list = box.current;
    if (!el || !list) return;
    const r = el.getBoundingClientRect(), l = list.getBoundingClientRect();
    if (r.top < l.top || r.bottom > l.bottom) list.scrollTop += r.top - l.top - l.height / 2;
  }, [i, open]);
  const groups = m.chapters.map((c) => ({ c, steps: m.steps.map((s, k) => ({ s, k })).filter(({ s }) => s.chapter === c.id) }));
  const loose = m.steps.map((s, k) => ({ s, k })).filter(({ s }) => !s.chapter);
  if (loose.length) groups.unshift({ c: { id: "", title: "" }, steps: loose });
  return (
    <>
    {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} aria-hidden="true" />}
    <aside ref={box} className={`${open ? "fixed inset-x-0 bottom-0 z-40 max-h-[70vh] rounded-t-2xl shadow-modal" : "hidden"} overflow-y-auto border border-border bg-white p-4 lg:static lg:block lg:max-h-[calc(68vh+15rem)] lg:rounded-2xl lg:shadow-xs`}
      aria-label={w.steps}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-text">{w.steps}</h3>
        <button type="button" onClick={onClose} className="rounded p-1 text-text-muted hover:text-text lg:hidden cursor-pointer" aria-label="✕"><X size={16} /></button>
      </div>
      {groups.map(({ c, steps }) => (
        <div key={c.id} className="mb-3">
          {c.title && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{c.title}</p>}
          <ol>
            {steps.map(({ s, k }) => (
              <li key={s.id}>
                <button ref={k === i ? current : undefined} type="button" onClick={() => onGo(k)} aria-current={k === i ? "step" : undefined}
                  className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm cursor-pointer ${k === i ? "bg-primary-light font-semibold text-primary" : k < i ? "text-text-secondary hover:bg-surface-alt" : "text-text hover:bg-surface-alt"}`}>
                  <span className={`mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-full text-[11px] font-bold ${k === i ? "bg-primary text-white" : k < i ? "bg-emerald-100 text-emerald-700" : "bg-surface-hover text-text-muted"}`}>{s.n}</span>
                  <span className="min-w-0">{s.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </aside>
    </>
  );
}
