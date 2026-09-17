import { createHash } from "node:crypto";
import type { Dependency } from "./dependencies.ts";

export const repository = "https://github.com/9uiLe/hamio";
export const runtime = {
  version: "1.4.2",
  revision: "744846f844374847c902b5e7fd59b4342a51ef99",
  noticesSha256: "b9caf52728691b4057e371232c221a132883198be2f3d2ddf92c90404c984b1a",
};

export function releaseIdentity(version: string, platform: string, arch: string) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error("A release requires an exact X.Y.Z version.");
  }
  const target = `${platform}-${arch}`;
  if (!["darwin-arm64", "linux-x64", "linux-arm64"].includes(target)) {
    throw new Error(`Unsupported release target: ${target}`);
  }
  return { tag: `v${version}`, target, asset: `hamio-v${version}-${target}` };
}

interface InventoryInput {
  version: string;
  target: string;
  commit: string;
  modified: boolean;
  created: string;
  sourceSha256: string;
  binarySha256: string;
  archiveSha256: string;
  runtimeSha256: string;
  lockSha256: string;
  flakeSha256: string;
  license: string;
  dependencies: Dependency[];
}

export function inventory(input: InventoryInput) {
  const common = {
    filesAnalyzed: false,
    licenseConcluded: "NOASSERTION",
    copyrightText: "NOASSERTION",
  };
  const packages = [
    {
      ...common,
      SPDXID: "SPDXRef-hamio",
      name: "hamio",
      versionInfo: input.version,
      downloadLocation: `${repository}/releases/download/v${input.version}/hamio-v${input.version}-${input.target}.gz`,
      licenseDeclared: input.license,
      checksums: [{ algorithm: "SHA256", checksumValue: input.archiveSha256 }],
      sourceInfo: `Source ${repository}/tree/${input.commit}; worktree modified ${input.modified}; inputs SHA256 ${input.sourceSha256}; target ${input.target}; executable SHA256 ${input.binarySha256}; bun.lock SHA256 ${input.lockSha256}; flake.lock SHA256 ${input.flakeSha256}`,
    },
    {
      ...common,
      SPDXID: "SPDXRef-bun",
      name: "bun",
      versionInfo: runtime.version,
      downloadLocation: `https://github.com/oven-sh/bun/releases/tag/bun-v${runtime.version}`,
      licenseDeclared: "NOASSERTION",
      checksums: [{ algorithm: "SHA256", checksumValue: input.runtimeSha256 }],
      sourceInfo: `https://github.com/oven-sh/bun/tree/${runtime.revision}`,
      comment:
        "Aggregate prebuilt runtime, including JavaScriptCore, native libraries and embedded polyfills. See the upstream notices. Component-level versions and licenses inside this runtime are not resolved by this inventory; Bun must not be treated as MIT-only.",
    },
    ...input.dependencies.map((dependency, index) => ({
      ...common,
      SPDXID: `SPDXRef-npm-${index}`,
      name: dependency.name,
      versionInfo: dependency.version,
      downloadLocation: `https://registry.npmjs.org/${dependency.name}/-/${dependency.name.split("/").at(-1)}-${dependency.version}.tgz`,
      licenseDeclared: dependency.license,
      sourceInfo: `Installed package.json SHA256 ${dependency.metadataSha256}; archive integrity pinned in bun.lock at source commit ${input.commit}`,
      externalRefs: [
        {
          referenceCategory: "PACKAGE-MANAGER",
          referenceType: "purl",
          referenceLocator: `pkg:npm/${dependency.name.replace("@", "%40")}@${dependency.version}`,
        },
      ],
    })),
  ];
  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `hamio-${input.version}-${input.target}`,
    documentNamespace: `${repository}/sbom/${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`,
    creationInfo: { creators: [`Tool: hamio-release-${input.version}`], created: input.created },
    comment:
      "Scope: hamio, installed production npm graph and the hash-pinned Bun runtime as an aggregate. Not a complete component-level inventory of Bun's native dependencies. Attestation proves origin, not inventory completeness or absence of vulnerabilities.",
    packages,
    relationships: [
      {
        spdxElementId: "SPDXRef-DOCUMENT",
        relationshipType: "DESCRIBES",
        relatedSpdxElement: "SPDXRef-hamio",
      },
      ...packages.slice(1).map((entry) => ({
        spdxElementId: "SPDXRef-hamio",
        relationshipType: "DEPENDS_ON",
        relatedSpdxElement: entry.SPDXID,
      })),
    ],
  };
}
