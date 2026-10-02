export const protocolLimits = {
  documentBytes: 256 * 1024,
  frameBytes: 64 * 1024,
  depth: 16,
  nodes: 20_000,
  stringBytes: 4096,
} as const;
