import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

type LockPackage = {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  dev?: boolean;
};

function licenseText(value: LockPackage["license"]): string {
  if (typeof value === "string") return value;
  return value?.type ?? "UNKNOWN";
}

function packageName(packagePath: string, entry: LockPackage): string {
  if (entry.name) return entry.name;
  const marker = "node_modules/";
  const index = packagePath.lastIndexOf(marker);
  return index >= 0 ? packagePath.slice(index + marker.length) : packagePath || "golf-lesson-tutor";
}

async function main() {
  const lock = JSON.parse(await fs.readFile("package-lock.json", "utf8")) as {
    packages: Record<string, LockPackage>;
  };
  const components = Object.entries(lock.packages)
    .filter(([, entry]) => Boolean(entry.version))
    .map(([packagePath, entry]) => {
      const name = packageName(packagePath, entry);
      const version = entry.version!;
      const license = licenseText(entry.license);
      return {
        type: "library",
        name,
        version,
        scope: entry.dev ? "optional" : "required",
        licenses: [{ license: { id: license } }],
        purl: `pkg:npm/${encodeURIComponent(name)}@${version}`,
      };
    })
    .sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));

  const denied = components.filter((component) => {
    if (component.scope !== "required") return false;
    const license = component.licenses[0].license.id.toUpperCase();
    return (
      license.includes("AGPL") ||
      license.includes("SSPL") ||
      license.includes("BUSL") ||
      license.includes("COMMONS CLAUSE") ||
      (license.includes("GPL") && !license.includes("LGPL"))
    );
  });
  if (denied.length > 0) {
    throw new Error(
      `운영 의존성에 검토가 필요한 라이선스가 있습니다:\n${denied
        .map((item) => `- ${item.name}@${item.version}: ${item.licenses[0].license.id}`)
        .join("\n")}`,
    );
  }

  const artifactDir = path.resolve(".artifacts");
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(
    path.join(artifactDir, "sbom.cdx.json"),
    JSON.stringify(
      {
        bomFormat: "CycloneDX",
        specVersion: "1.5",
        serialNumber: `urn:uuid:${randomUUID()}`,
        version: 1,
        metadata: { timestamp: new Date().toISOString() },
        components,
      },
      null,
      2,
    ),
  );
  console.log(`license check passed; SBOM components: ${components.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
