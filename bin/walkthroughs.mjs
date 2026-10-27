#!/usr/bin/env node
// walkthroughs <publish | offline | review-cards> [options]: each command is a script in tools/, run with the rest of
// the arguments. Paths are taken from the directory it is run in.
import { fileURLToPath } from "node:url";

const TOOLS = { publish: "publish.mjs", offline: "offline.mjs", "review-cards": "review-cards.mjs" };
const [command, ...rest] = process.argv.slice(2);
if (!TOOLS[command]) {
  console.error(`walkthroughs <${Object.keys(TOOLS).join(" | ")}> [options]`);
  process.exit(command ? 1 : 0);
}
process.argv = [process.argv[0], fileURLToPath(new URL(`../tools/${TOOLS[command]}`, import.meta.url)), ...rest];
await import(new URL(`../tools/${TOOLS[command]}`, import.meta.url).href);
