// Shared transport bounds; Presentation and Form validate their own semantic limits separately.
export const ioLimits = {
  documentBytes: 256 * 1024,
  frameBytes: 64 * 1024,
  outputTimeoutMs: 5000,
} as const;
