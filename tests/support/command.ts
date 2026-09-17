import { resolve } from "node:path";

/** Release verification supplies the exact decompressed artifact to the same CLI tests. */
export function productCommand(args: string[]): string[] {
  const binary = process.env.HAMIO_TEST_BINARY;
  return binary
    ? [resolve(binary), ...args]
    : [process.execPath, "--no-env-file", "--no-install", resolve("src/cli.ts"), ...args];
}
