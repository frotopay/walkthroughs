// The player as the offline file has it (dist/offline, built with the package), on a small walkthrough made up here:
// steps and keys, the language switch at the same step, playing on its own, practice mode, who it is for, and colours
// set from outside.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

const steps = (lang: "hi" | "en") => {
  const t = (en: string, hi: string) => (lang === "hi" ? hi : en);
  return [
    { id: "home", n: 1, chapter: "start", title: t("Your home page", "आपका मुखपृष्ठ"), say: t("This is home.", "यह मुखपृष्ठ है।"), action: { verb: "goto" }, url: "/", after: "01-after.webp", hold_ms: 2500, checks: [] },
    { id: "open", n: 2, chapter: "start", title: t("Open the form", "प्रपत्र खोलें"), say: t("Choose the tile.", "टाइल चुनें।"), action: { verb: "click", target: "x" }, box: { x: 0.1, y: 0.2, w: 0.2, h: 0.1 }, url: "/p/new", before: "02.webp", after: "02-after.webp", hold_ms: 2500, checks: [] },
    { id: "name", n: 3, chapter: "fill", title: t("Your name", "आपका नाम"), say: t("Type your name.", "अपना नाम लिखें।"), action: { verb: "fill", target: "y", value: "Kamla" }, box: { x: 0.3, y: 0.5, w: 0.3, h: 0.06 }, url: "/p/new", before: "03.webp", after: "03-after.webp", hold_ms: 2500, checks: [] },
  ];
};
const manifest = (lang: "hi" | "en") => ({
  schema: 1, journey: "demo", persona: "citizen", project: `desk-${lang}`, lang, device: "desk", viewport: { w: 1366, h: 800, dpr: 1 },
  app: { web: "test", api: "test" }, captured: "2026-10-24T10:00:00Z", status: "passed",
  title: lang === "hi" ? "डेमो" : "Demo", summary: lang === "hi" ? "एक छोटी मार्गदर्शिका।" : "A short walkthrough.",
  chapters: [{ id: "start", title: lang === "hi" ? "शुरुआत" : "Start" }, { id: "fill", title: lang === "hi" ? "भरें" : "Fill" }],
  steps: steps(lang),
});

let js: string, css: string, picture: string;
test.beforeAll(async () => {
  js = await readFile("dist/offline/player.js", "utf8");
  css = await readFile("dist/offline/player.css", "utf8");
  picture = `data:image/webp;base64,${(await sharp({ create: { width: 683, height: 400, channels: 3, background: "#cbd5e1" } }).webp().toBuffer()).toString("base64")}`;
});

/** The page as `walkthroughs offline` writes it, with English first so the tests read in English. */
async function open(page: Page, extraCss = "") {
  const variants = { "desk-en": manifest("en"), "desk-hi": manifest("hi") };
  const pictures = Object.fromEntries(Object.keys(variants).flatMap((v) => ["01-after", "02", "02-after", "03", "03-after"].map((f) => [`${v}/${f}.webp`, picture])));
  const data = { variants, pictures, persona: { en: "Citizens", hi: "नागरिक" } };
  await page.setContent(`<!doctype html><html><head><style>${css}${extraCss}</style></head><body><div id="root"></div>
<script>window.__WALKTHROUGH__=${JSON.stringify(data)};</script><script type="module">${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`);
  await expect(page.getByTestId("player")).toBeVisible();
}

test("names who it is for, and moves a step at a time with the buttons and keys", async ({ page }) => {
  await open(page);
  await expect(page.getByText("Citizens")).toBeVisible();
  await expect(page.getByTestId("step-title")).toHaveText("Your home page");
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByTestId("step-title")).toHaveText("Open the form");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("step-title")).toHaveText("Your name");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("step-title")).toHaveText("Open the form");
  await page.getByRole("button", { name: "3. Your name" }).click();
  await expect(page.getByText("Step 3 of 3")).toBeVisible();
});

test("the other language opens at the same step", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "3. Your name" }).click();
  await page.getByRole("button", { name: "हिन्दी" }).click();
  await expect(page.getByTestId("step-title")).toHaveText("आपका नाम");
  await expect(page.getByText("चरण 3 / 3")).toBeVisible();
  await expect(page.getByText("नागरिक")).toBeVisible();
});

test("play runs through the steps by itself; practice mode stops after each", async ({ page }) => {
  await page.clock.install();
  await open(page);
  await expect(page.getByTestId("time")).toHaveText(/^0:00 \/ 0:\d\d$/);
  await page.getByRole("button", { name: "Play" }).click();
  await page.clock.runFor(4000);
  await expect(page.getByTestId("step-title")).toHaveText("Open the form");
  await page.clock.runFor(12_000);
  await expect(page.getByText("That is the whole walkthrough.")).toBeVisible();
  const [done, total] = (await page.getByTestId("time").textContent())!.split(" / ");
  expect(done).toBe(total);

  await page.getByRole("button", { name: "Start again" }).click();
  await page.getByRole("checkbox", { name: "Step by step" }).check();
  await page.getByRole("button", { name: "Play" }).click();
  await page.clock.runFor(10_000);
  await expect(page.getByTestId("step-title")).toHaveText("Your home page");
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  await page.getByRole("button", { name: "Next step" }).click();
  await page.clock.runFor(10_000);
  await expect(page.getByTestId("step-title")).toHaveText("Open the form");
});

test("colours come from the theme's variables, so a stylesheet after it sets them", async ({ page }) => {
  await open(page, ":root{--color-primary:#0f766e}");
  await expect(page.getByTestId("play")).toHaveCSS("background-color", "rgb(15, 118, 110)");
});
