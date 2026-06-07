/**
 * Phase A + Confluence smoke test (no LLM)
 */
import { collectAllData } from "../src/lib/collectors/index.ts";
import { runTechnicalAnalysis } from "../src/lib/analysis/index.ts";
import {
  buildPhaseLocationSection,
  buildThreePartConceptSection,
} from "../src/lib/analysis/phase-concepts.ts";
const collected = await collectAllData();
const technical = runTechnicalAnalysis(collected, []);

console.log("=== Phase A ===");
console.log("phase:", technical.marketPhase, technical.marketPhaseLabel);
console.log("phaseReasons:", technical.phaseReasons.slice(0, 2).join(" | "));
console.log("concept:", technical.conceptSuggestion.name);

console.log("\n=== Confluence ===");
console.log("structure:", technical.confluence.structureLayer.summary.slice(0, 80));
console.log("synthesis:", technical.confluence.synthesis.slice(0, 100));
console.log("actionBridge:", technical.confluence.actionBridge.slice(0, 100));

const keyLevelsBlock = technical.keyLevels
  .slice(0, 3)
  .map((l) => `- ${l.type} ${l.price}`)
  .join("\n");

const section4 = buildPhaseLocationSection(technical, technical.confluence, keyLevelsBlock);
const section5 = buildThreePartConceptSection(
  technical.conceptSuggestion.name,
  technical,
  technical.confluence
);

console.log("\n=== Section ④ (head) ===");
console.log(section4.slice(0, 400));
console.log("\n=== Section ⑤ (head) ===");
console.log(section5.slice(0, 400));

console.log("\n=== Checks ===");
console.log("④ has コンフルエンス:", section4.includes("コンフルエンス"));
console.log("⑤ has ①学習:", section5.includes("①"));
console.log("⑤ has actionBridge:", section5.includes(technical.confluence.actionBridge.slice(0, 30)));
