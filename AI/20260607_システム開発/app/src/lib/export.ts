import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getOutputBase } from "@/lib/paths";

export async function exportArtifacts(
  jobId: string,
  reportMd: string,
  scriptMd: string,
  scriptNumber: number
): Promise<{ reportPath: string; scriptPath: string }> {
  const date = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const outputBase = getOutputBase();
  const reportsDir = path.join(outputBase, "reports");
  const scriptsDir = path.join(outputBase, "scripts");

  await mkdir(reportsDir, { recursive: true });
  await mkdir(scriptsDir, { recursive: true });

  const reportFilename = `report_${date}_${jobId.slice(0, 8)}.md`;
  const scriptFilename = `台本${scriptNumber}_BTC分析_${date}.md`;

  const reportPath = path.join(reportsDir, reportFilename);
  const scriptPath = path.join(scriptsDir, scriptFilename);

  await writeFile(reportPath, reportMd, "utf-8");
  await writeFile(scriptPath, scriptMd, "utf-8");

  const technicalOutput = process.env.TECHNICAL_OUTPUT_PATH;
  if (technicalOutput) {
    const techDir = path.isAbsolute(technicalOutput)
      ? technicalOutput
      : path.join(process.cwd(), technicalOutput);
    await mkdir(techDir, { recursive: true });
    await writeFile(path.join(techDir, scriptFilename), scriptMd, "utf-8");
  }

  return { reportPath, scriptPath };
}

export async function exportCoinReport(
  jobId: string,
  symbol: string,
  reportMd: string
): Promise<string> {
  const date = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const outputBase = getOutputBase();
  const reportsDir = path.join(outputBase, "reports");
  await mkdir(reportsDir, { recursive: true });

  const filename = `${symbol}_リサーチ_${date}_${jobId.slice(0, 8)}.md`;
  const reportPath = path.join(reportsDir, filename);
  await writeFile(reportPath, reportMd, "utf-8");
  return reportPath;
}
