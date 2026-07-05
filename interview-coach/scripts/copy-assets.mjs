// Copies non-TS assets needed by the compiled main process into dist-electron.
import { mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const targets = [["electron/db/schema.sql", "dist-electron/electron/db/schema.sql"]];

for (const [src, dest] of targets) {
  mkdirSync(join(root, dirname(dest)), { recursive: true });
  copyFileSync(join(root, src), join(root, dest));
}
console.log("assets copied");
