import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(".next/standalone");
const forbiddenTopLevel = new Set(["src", "docs", "scripts", "data", ".git"]);
const allowedTopLevel = new Set([".next", "node_modules", "package.json", "server.js"]);
const problems: string[] = [];

async function walk(directory: string): Promise<void> {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute);
    if (relative.split(path.sep).length === 1 && forbiddenTopLevel.has(entry.name)) {
      problems.push(`금지된 최상위 경로: ${relative}`);
      continue;
    }
    if (relative.split(path.sep).length === 1 && !allowedTopLevel.has(entry.name)) {
      problems.push(`허용되지 않은 최상위 경로: ${relative}`);
      continue;
    }
    if (entry.name === ".env" || entry.name.startsWith(".env.")) {
      problems.push(`환경 변수 파일 포함: ${relative}`);
    }
    if (entry.isDirectory()) await walk(absolute);
  }
}

async function main() {
  await fs.access(path.join(root, "server.js"));
  await walk(root);
  for (const file of ["README.md", "Dockerfile", "tailwind.config.ts"]) {
    try {
      await fs.access(path.join(root, file));
      problems.push(`불필요한 프로젝트 파일 포함: ${file}`);
    } catch {
      // expected
    }
  }
  if (problems.length > 0) {
    throw new Error(`standalone 산출물 안전 검사 실패:\n- ${problems.join("\n- ")}`);
  }
  console.log("standalone artifact safety check passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
