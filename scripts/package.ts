import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

// Packaging is explicit: ordinary builds and checks do not pay the compression cost.
const binary = "dist/hamio";
const archive = `${binary}.gz`;
await pipeline(createReadStream(binary), createGzip({ level: 9 }), createWriteStream(archive));
const [input, output] = await Promise.all([stat(binary), stat(archive)]);
console.log(`Packaged ${archive}: ${output.size} bytes (${input.size} bytes unpacked).`);
