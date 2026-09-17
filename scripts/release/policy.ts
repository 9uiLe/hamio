/** Publication requires an exact version tag; rehearsal also accepts owner branches. */
export function releaseMode(
  mode: string | undefined,
  repository: string | undefined,
  ref: string | undefined,
  tag: string,
): "verify" | "publish" {
  if (repository !== "9uiLe/hamio") throw new Error("Unexpected release repository.");
  if (mode !== "verify" && mode !== "publish")
    throw new Error("Choose verify or publish explicitly.");
  if (!ref || !(ref.startsWith("refs/heads/") || ref === `refs/tags/${tag}`))
    throw new Error("Use a branch or the exact package version tag.");
  if (mode === "publish" && ref !== `refs/tags/${tag}`)
    throw new Error("Publication requires the exact package version tag.");
  return mode;
}
