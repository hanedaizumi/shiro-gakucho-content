import path from "path";

export function getTechnicalWorkspacePath(): string {
  const configured = process.env.TECHNICAL_WORKSPACE_PATH;
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(process.cwd(), configured);
  }
  return path.join(process.cwd(), "..", "..", "..", "シロ学長テクニカル");
}
