// The library's own tests: the player as the offline file has it. Run `npm run build` first.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test",
  outputDir: "test-results",
  reporter: "list",
  // PW_CHANNEL=chrome uses the Chrome already installed instead of Playwright's own.
  use: { viewport: { width: 1366, height: 800 }, locale: "en-IN", channel: process.env.PW_CHANNEL },
});
