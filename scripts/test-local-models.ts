/**
 * Local model accuracy test harness — NOT part of the app, never imported
 * by anything under src/. Run manually from a terminal while iterating on
 * which classification model to commit to (see docs/MODELS.html §03).
 *
 * For a browser-based side-by-side comparison instead, see
 * `npm run test:ui` (scripts/test-ui-server.ts) — same underlying logic,
 * shared via scripts/model-test-lib.ts.
 *
 * What it does: renders each page of a real PDF to a PNG (Ollama's local
 * API only accepts images, not raw PDF bytes — unlike OpenRouter, which
 * accepts a `file` part for some providers; this is a real, permanent
 * difference between local testing and production, not a shortcut), sends
 * every page plus the exact production system prompt to each local Ollama
 * model in turn, and writes each model's raw JSON response to its own file
 * so they can be diffed side by side.
 *
 * Usage:
 *   npx tsx scripts/test-local-models.ts path/to/form.pdf
 *   npx tsx scripts/test-local-models.ts path/to/form.pdf --models=gemma4:26b,qwen2.5vl:7b
 *
 * Requires Ollama running locally (default http://localhost:11434) with
 * the models below already pulled.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, extname } from "node:path";
import { DEFAULT_MODELS, renderPdfFileToPngs, runModel, tryParseJson, unloadAllModels } from "./model-test-lib";

async function main() {
  const [, , pdfPathArg, ...rest] = process.argv;
  if (!pdfPathArg) {
    console.error("Usage: npx tsx scripts/test-local-models.ts <path-to-pdf> [--models=a,b,c]");
    process.exit(1);
  }

  const modelsArg = rest.find((a) => a.startsWith("--models="));
  const models = modelsArg ? modelsArg.slice("--models=".length).split(",") : DEFAULT_MODELS;

  // Clear anything left resident from a previous interrupted run before
  // starting — on a CPU-only machine, leftover models pile up and starve
  // the new run instead of erroring cleanly.
  console.log("Unloading any models left resident from a previous run...");
  await unloadAllModels();

  console.log(`Rendering ${pdfPathArg} to page images...`);
  const images = await renderPdfFileToPngs(pdfPathArg);
  console.log(`  ${images.length} page(s) rendered.`);

  const formName = basename(pdfPathArg, extname(pdfPathArg));
  const outDir = join("scripts", "results", formName);
  await mkdir(outDir, { recursive: true });

  for (const model of models) {
    console.log(`\nRunning ${model}...`);
    const result = await runModel(model, images);
    const status = result.ok ? "ok" : "FAILED";
    console.log(`  ${status} in ${(result.ms / 1000).toFixed(1)}s`);

    const safeName = model.replace(/[/:]/g, "_");
    const outFile = join(outDir, `${safeName}.json`);
    await writeFile(
      outFile,
      JSON.stringify({ model, ok: result.ok, ms: result.ms, response: tryParseJson(result.raw) ?? result.raw }, null, 2),
    );
    console.log(`  saved to ${outFile}`);
  }

  console.log(`\nDone. Compare outputs in ${outDir}/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
