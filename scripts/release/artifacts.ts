import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

export async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function compress(binary: string, archive: string): Promise<void> {
  await pipeline(createReadStream(binary), createGzip({ level: 9 }), createWriteStream(archive));
}

export async function assetHashes(directory: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const name of (await readdir(directory)).sort())
    result[name] = await sha256(join(directory, name));
  return result;
}

/** Stale files cannot enter the next asset set. A failed publication restores the old set. */
export async function publishAssets(staged: string, output: string): Promise<void> {
  await mkdir(dirname(output), { recursive: true });
  const lock = `${output}.lock`;
  await mkdir(lock);
  let backup: string | undefined;
  try {
    const directory = await mkdtemp(join(dirname(output), ".hamio-previous-"));
    backup = directory;
    try {
      await rename(output, join(directory, "assets"));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    try {
      await rename(staged, output);
    } catch (error) {
      try {
        await rename(join(directory, "assets"), output);
      } catch (restore) {
        if (!(restore instanceof Error && "code" in restore && restore.code === "ENOENT")) {
          backup = undefined;
          throw new Error(`Could not restore assets; inspect ${directory}.`, { cause: restore });
        }
      }
      throw error;
    }
  } finally {
    if (backup) await rm(backup, { recursive: true, force: true });
    await rm(lock, { recursive: true });
  }
}
