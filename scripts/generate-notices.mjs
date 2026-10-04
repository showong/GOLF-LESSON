// 운영 의존성(설치된 node_modules 기준)으로 THIRD_PARTY_NOTICES.md를 다시 만든다.
// 사용법: npm ci 후 `npm run notices`
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const tree = JSON.parse(
  execSync("npm ls --omit=dev --all --json --long", { cwd: root, maxBuffer: 1e9 }).toString(),
);

function licenseOf(pkg) {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((entry) => entry.type).join(" OR ");
  return "UNKNOWN";
}

const packages = new Map();
(function walk(deps) {
  for (const [name, info] of Object.entries(deps ?? {})) {
    if (!info.version) continue; // 이 플랫폼에 설치되지 않은 선택 의존성
    const key = `${name}@${info.version}`;
    if (packages.has(key)) continue;
    const manifestPath = path.join(info.path ?? path.join(root, "node_modules", name), "package.json");
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const repo =
      typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
    packages.set(key, {
      name,
      version: info.version,
      license: licenseOf(manifest),
      url: manifest.homepage ?? repo?.replace(/^git\+/, "").replace(/\.git$/, "") ?? "",
    });
    walk(info.dependencies);
  }
})(tree.dependencies);

const rows = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name));
const byLicense = rows.reduce((acc, row) => {
  acc[row.license] = (acc[row.license] ?? 0) + 1;
  return acc;
}, {});

const header = fs.readFileSync(path.join(root, "scripts", "notices-header.md"), "utf8");
const summary = Object.entries(byLicense)
  .sort((a, b) => b[1] - a[1])
  .map(([license, count]) => `| ${license} | ${count} |`)
  .join("\n");
const table = rows
  .map((row) => `| ${row.name} | ${row.version} | ${row.license} | ${row.url} |`)
  .join("\n");

const output = `${header.trim()}

## 운영 의존성 전체 목록

\`npm run notices\`로 생성 (Linux x64 설치 기준, 운영 의존성 ${rows.length}개).

| 라이선스 | 패키지 수 |
|---|---|
${summary}

| 패키지 | 버전 | 라이선스 | 출처 |
|---|---|---|---|
${table}
`;
fs.writeFileSync(path.join(root, "THIRD_PARTY_NOTICES.md"), output);
console.log(`THIRD_PARTY_NOTICES.md: ${rows.length} packages`);
