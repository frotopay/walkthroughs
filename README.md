# @frotopay/walkthroughs

Browser journeys that test an app and teach it. A journey written once with Playwright runs as a test; with
`CAPTURE=1` it also records every step, and those records become a walkthrough player that moves like a video, single
offline files for training rooms, and review cards.

```
journeys/*.spec.ts ──run──▶ tests pass or fail
      │ CAPTURE=1
      ▼
e2e/out/<journey>/<project>/manifest.json + NN.webp
      │ walkthroughs publish
      ▼
<folder or bucket>/index.json, <journey>/<variant>/manifest.json + pictures ──▶ Player (in the app)
                                                                           ──▶ walkthroughs offline (one HTML each)
```

First taken out of [upyog-web](https://github.com/udd-ddn/upyog-web), with its history.

## Install

```bash
npm install github:frotopay/walkthroughs#v0.2.0
```

The repository is private: the machine installing needs read access to it (a deploy key or a read-only token).
`prepare` builds `dist/` on install. Peers: `@playwright/test` and `sharp` for recording and the tools; `react` and
`lucide-react` for the player.

## Record

```ts
import { Guide, captionProblems, type Captions } from "@frotopay/walkthroughs/record";

const g = new Guide(page, captions, { lang, device, project, capture: process.env.CAPTURE === "1", dpr, api: API_URL });
g.chapter("open");
await g.goto("home", "/");
await g.click("start", page.getByRole("button", { name: t("Start", "शुरू करें") }), { then: () => expect(…).toBeVisible() });
await g.finish(passed ? "passed" : "failed");
```

- **Captions** (`Captions`) are the walkthrough's title, summary, chapters and every step's title and caption, in
  English and Hindi. A guide refuses captions missing a language, a step with no caption, and (on a pass) a caption no
  step used. An optional `module` names the service it is about; it is carried into the manifest and `index.json`, so
  an app can list walkthroughs by service.
- **Steps:** `goto`, `click`, `fill`, `select`, `check`, `upload`, `look`; `then:` is what must be true after it,
  `show:` what a `goto` rings on the screen it arrives at, `at:` a point in a map. `secret:` keeps a typed value (a
  code, a password) out of the manifest; `mask:` covers something on this step's pictures and all after it.
- **Still screens:** before a picture, it waits for no request in flight for 400 ms, nothing `aria-busy`, no
  unfinished image, the scroll to stop and the fonts; and takes it again if the target moved.
- **Options:** `out` (default `e2e/out`), `api` (recorded in the manifest), `src` (the folder whose git commit, with
  `+changes` if edited, the manifest records; default `src`).

Wrap it in a Playwright fixture so each journey gets one and `finish` runs when the test ends.

## Publish

```bash
npx walkthroughs publish --from e2e/out --to public/walkthroughs --personas personas.json     # to a folder
npx walkthroughs publish --from e2e/out --r2 my-bucket --channel beta --personas personas.json # to Cloudflare R2
```

Takes every passed capture, resizes and re-encodes the pictures (WebP 65), shares a before-screen with the after-screen
before it when they look the same, names pictures by their content, and writes the manifests and `index.json`.
`--personas` (a file naming them, `{ "citizen": { "en": …, "hi": … } }`) or `--order citizen,clerk,…` sets the order of
personas in the index.

A folder and a bucket hold the same layout:

```
pics/<hash>.webp                               every picture, shared by every channel; never changes
<channel>/index.json                           what the player lists
<channel>/<journey>/<variant>/manifest.json    one walkthrough, one language, one screen
```

A channel (`--channel`, default `latest`) is a line of releases, such as `beta`; the app reads one. To R2 it sends only
pictures not already in `pics/`, then the manifests, then `index.json` last, so a reader never gets an index naming a
file not yet there. It needs `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` (an R2 API token with
write access to the bucket). Pictures go up with `Cache-Control: immutable` for a year, manifests and the index for five
minutes. The bucket needs a public domain and CORS for the app's origins.

## Play

```tsx
import { Player, WORDS } from "@frotopay/walkthroughs/player";
import { loader, pickVariant } from "@frotopay/walkthroughs/manifest";

const { getIndex, getManifest, pictureOf } = loader("https://learn.example.com/beta"); // a channel; pictures from ../pics
<Player manifest={m} src={pictureOf(journey, variant)} variants={variants} onVariant={…} start={0} onStep={…} />
```

Play, pause, back and next (Space, ←, →), chapters, speed, practice mode (stop after each step), the language and
screen switch at the same step. Its words are in `WORDS` (English and Hindi); who a walkthrough is for is the app's to
name.

**Styles:** the player is written in Tailwind v4 classes on these theme names: `primary`, `primary-dark`,
`primary-light`, `surface-alt`, `surface-hover`, `border`, `text`, `text-secondary`, `text-muted`, `shadow-xs`,
`shadow-modal`. An app on Tailwind v4 defines them in its own `@theme` and adds

```css
@source "../node_modules/@frotopay/walkthroughs/dist/player";
```

so its build keeps the player's classes. `@frotopay/walkthroughs/theme.css` has defaults for an app without them.

## Offline files

```bash
npx walkthroughs offline --from public/walkthroughs/latest --out e2e/out/offline --brand "UPYOG Uttarakhand" \
  --personas personas.json --css theme-overrides.css
```

One HTML per walkthrough and language with the player, the fonts (Latin and Devanagari) and every picture inside;
each is opened once with the network blocked to prove it plays. `--css` comes after the player's styles, so
`:root { --color-primary: … }` sets its colours.

## Review cards

```bash
npx walkthroughs review-cards --from e2e/out [journey]   # PW_CHANNEL=chrome: the installed Chrome
```

One image per step: the caption, the before-screen with the target ringed, the after-screen. For reviewing a capture
before it is published.

## Work on it

```bash
npm install
npm run build
npm test                      # the player, as the offline file has it; PW_CHANNEL=chrome uses the installed Chrome
npm run typecheck
```
