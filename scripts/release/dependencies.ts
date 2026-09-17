import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { sha256 } from "./artifacts.ts";

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected package metadata.");
  }
  return value as Record<string, unknown>;
}

export interface Dependency {
  name: string;
  version: string;
  license: string;
  notice: string;
  metadataSha256: string;
}

// Resolve the installed production graph, rather than including development tools in the SBOM.
export async function productionDependencies(root: string): Promise<Dependency[]> {
  const seen = new Set<string>();
  const dependencies: Dependency[] = [];
  async function visit(name: string, parent: string) {
    const require = createRequire(join(parent, "package.json"));
    const file = require.resolve(`${name}/package.json`);
    if (seen.has(file)) return;
    seen.add(file);
    const directory = dirname(file);
    const data = object(JSON.parse(await readFile(file, "utf8")));
    if (
      data.name !== name ||
      typeof data.version !== "string" ||
      typeof data.license !== "string"
    ) {
      throw new Error(`Incomplete production dependency metadata: ${name}`);
    }
    const licenseFile = (await readdir(directory))
      .sort()
      .find((entry) => /^licen[cs]e(?:\..*)?$/i.test(entry));
    if (!licenseFile) throw new Error(`Missing license text: ${name}`);
    dependencies.push({
      name,
      version: data.version,
      license: data.license,
      notice: await readFile(join(directory, licenseFile), "utf8"),
      metadataSha256: await sha256(file),
    });
    // Changes introducing peers or optional dependencies need an explicit inventory policy.
    if (data.peerDependencies || data.optionalDependencies) {
      throw new Error(`Review peer/optional dependency inventory: ${name}`);
    }
    for (const child of Object.keys(object(data.dependencies ?? {})).sort()) {
      await visit(child, directory);
    }
  }
  const pkg = object(JSON.parse(await readFile(join(root, "package.json"), "utf8")));
  for (const name of Object.keys(object(pkg.dependencies)).sort()) await visit(name, root);
  return dependencies.sort((a, b) =>
    `${a.name}@${a.version}` < `${b.name}@${b.version}`
      ? -1
      : `${a.name}@${a.version}` > `${b.name}@${b.version}`
        ? 1
        : 0,
  );
}
