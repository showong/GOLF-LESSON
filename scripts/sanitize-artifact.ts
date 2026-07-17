import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(".next/standalone");
const allowedTopLevel = new Set([".next", "node_modules", "package.json", "server.js"]);
let removed = 0;

async function removeEnvironmentFiles(directory: string): Promise<void> {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.name === ".env" || entry.name.startsWith(".env.")) {
      await fs.rm(absolute, { recursive: true, force: true });
      removed += 1;
      continue;
    }
    if (entry.isDirectory()) await removeEnvironmentFiles(absolute);
  }
}

async function sanitize() {
  await removeEnvironmentFiles(root);
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (allowedTopLevel.has(entry.name)) continue;
    await fs.rm(path.join(root, entry.name), { recursive: true, force: true });
    removed += 1;
  }
}

sanitize()
  .then(() => console.log(`standalone unsafe or unnecessary items removed: ${removed}`))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
