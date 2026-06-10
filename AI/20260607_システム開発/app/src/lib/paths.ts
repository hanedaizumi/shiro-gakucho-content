import path from "path";

/**
 * Resolve writable output directory.
 * - Local dev (cwd=app/): project-root output/ via ../output
 * - Cloud Run (cwd=/app): /app/output (parent is filesystem root)
 */
export function getOutputBase(): string {
  if (process.env.OUTPUT_BASE_PATH) {
    return path.resolve(process.env.OUTPUT_BASE_PATH);
  }

  const cwd = process.cwd();
  const parentDir = path.resolve(cwd, "..");

  if (parentDir === path.parse(parentDir).root) {
    return path.join(cwd, "output");
  }

  return path.resolve(cwd, "..", "output");
}
