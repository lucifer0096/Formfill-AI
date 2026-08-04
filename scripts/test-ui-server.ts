/**
 * Local browser UI for the model accuracy comparison — NOT part of the app,
 * separate port, separate process. Run with `npm run test:ui`, then open
 * http://localhost:3100. Upload a PDF, pick which local models to run, and
 * watch each model's result stream in side by side.
 *
 * Fully local: only talks to this machine's own Ollama daemon
 * (http://localhost:11434 by default). No OpenRouter, no paid API, no
 * external network call of any kind.
 */
import { createServer, type IncomingMessage } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { ALL_MODELS, SAFE_DEFAULT_MODELS, renderPdfBytesToPngs, runModel, tryParseJson, unloadAllModels } from "./model-test-lib";

const PORT = Number(process.env.TEST_UI_PORT ?? 3100);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB, matches the app's own upload limit

// This machine is CPU-only (no usable GPU) — running two comparisons at
// once would mean two models loaded simultaneously, which is exactly what
// caused real system slowdowns during testing. Reject a second /run while
// one is already in progress rather than letting them queue on top of
// each other.
let runInProgress = false;

const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FormFill — local model comparison</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: Canvas; color: CanvasText; line-height: 1.5;
  }
  h1 { font-size: 1.4rem; margin: 0 0 0.25rem; }
  .sub { color: GrayText; margin: 0 0 1.5rem; font-size: 0.9rem; }
  .panel {
    border: 1px solid color-mix(in srgb, CanvasText 20%, transparent);
    border-radius: 8px; padding: 1.25rem; margin-bottom: 1.5rem;
  }
  .row { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; margin-bottom: 1rem; }
  .models { display: flex; gap: 0.5rem 1.25rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .models label { display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; }
  button {
    font: inherit; padding: 0.55rem 1.1rem; border-radius: 6px; border: 1px solid transparent;
    background: #1F4FD8; color: #fff; cursor: pointer; font-weight: 600;
  }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  input[type="file"] { font: inherit; }
  .grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 1rem;
  }
  .card {
    border: 1px solid color-mix(in srgb, CanvasText 20%, transparent);
    border-radius: 8px; padding: 1rem; min-height: 120px;
  }
  .card h3 { margin: 0 0 0.5rem; font-size: 0.95rem; display: flex; justify-content: space-between; gap: 0.5rem; }
  .status { font-size: 0.75rem; font-weight: 600; padding: 0.1rem 0.5rem; border-radius: 999px; }
  .status.pending { background: color-mix(in srgb, CanvasText 10%, transparent); color: GrayText; }
  .status.running { background: #FFF3CD; color: #8A5A00; }
  .status.ok { background: #E2EEE7; color: #2F6B47; }
  .status.error { background: #FBE9E7; color: #B3261E; }
  .meta { font-size: 0.78rem; color: GrayText; margin: 0 0 0.5rem; }
  pre {
    font-size: 0.78rem; max-height: 360px; overflow: auto; margin: 0;
    background: color-mix(in srgb, CanvasText 6%, transparent); padding: 0.6rem; border-radius: 6px;
    white-space: pre-wrap; word-break: break-word;
  }
  .field-count { font-weight: 700; }
</style>
</head>
<body>
  <h1>FormFill — local model comparison</h1>
  <p class="sub">Upload a real form PDF, pick which local Ollama models to run, compare raw output side by side. Fully local — nothing leaves this machine.</p>

  <div class="panel">
    <div class="row">
      <input type="file" id="file" accept="application/pdf" />
      <button id="run" disabled>Run comparison</button>
    </div>
    <div class="models" id="models"></div>
  </div>

  <div class="grid" id="grid"></div>

<script>
  const ALL_MODELS = ${JSON.stringify(ALL_MODELS)};
  const SAFE_DEFAULT_MODELS = ${JSON.stringify(SAFE_DEFAULT_MODELS)};
  const modelsDiv = document.getElementById('models');
  const fileInput = document.getElementById('file');
  const runBtn = document.getElementById('run');
  const grid = document.getElementById('grid');

  // All 8 pulled models are listed and selectable — this machine is
  // CPU-only, so only the smallest model is pre-checked by default (avoids
  // an accidental multi-model run); check the rest deliberately when
  // you're ready to spend the time on a heavier one.
  ALL_MODELS.forEach((m) => {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = m; cb.checked = SAFE_DEFAULT_MODELS.includes(m);
    label.appendChild(cb);
    label.appendChild(document.createTextNode(m));
    modelsDiv.appendChild(label);
  });

  fileInput.addEventListener('change', () => {
    runBtn.disabled = !fileInput.files[0];
  });

  function fieldCount(parsed) {
    if (!parsed || !Array.isArray(parsed.sections)) return null;
    return parsed.sections.reduce((sum, s) => sum + (Array.isArray(s.fields) ? s.fields.length : 0), 0);
  }

  runBtn.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const selected = [...modelsDiv.querySelectorAll('input:checked')].map((c) => c.value);
    if (selected.length === 0) return;

    runBtn.disabled = true;
    grid.innerHTML = '';
    const cards = {};
    for (const model of selected) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = \`<h3><span>\${model}</span><span class="status pending" data-status>queued</span></h3>
        <p class="meta" data-meta></p>
        <pre data-out>—</pre>\`;
      grid.appendChild(card);
      cards[model] = card;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('models', selected.join(','));

    const response = await fetch('/run', { method: 'POST', body: formData });
    if (!response.ok || !response.body) {
      const message = await response.text().catch(() => '');
      grid.innerHTML = '<p>Upload failed (' + response.status + '): ' + (message || 'unknown error') + '</p>';
      runBtn.disabled = false;
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'status') {
          grid.insertAdjacentHTML('beforebegin', '<p class="sub" data-status-line>' + event.message + '</p>');
          continue;
        }
        const card = cards[event.model];
        if (!card) continue;
        const statusEl = card.querySelector('[data-status]');
        const metaEl = card.querySelector('[data-meta]');
        const outEl = card.querySelector('[data-out]');
        if (event.type === 'running') {
          statusEl.textContent = 'running';
          statusEl.className = 'status running';
        } else if (event.type === 'done') {
          statusEl.textContent = event.ok ? 'ok' : 'failed';
          statusEl.className = 'status ' + (event.ok ? 'ok' : 'error');
          const seconds = (event.ms / 1000).toFixed(1);
          const count = fieldCount(event.parsed);
          metaEl.innerHTML = seconds + 's' + (count !== null ? ' · <span class="field-count">' + count + '</span> fields detected' : '')
            + (event.savedTo ? ' · saved to <code>' + event.savedTo + '</code>' : '');
          outEl.textContent = JSON.stringify(event.parsed ?? event.raw, null, 2);
        }
      }
    }
    runBtn.disabled = false;
  });
</script>
</body>
</html>`;

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(PAGE_HTML);
    return;
  }

  if (req.method === "POST" && req.url === "/run") {
    if (runInProgress) {
      res.writeHead(409, { "Content-Type": "text/plain" });
      res.end("A comparison is already running — wait for it to finish before starting another (this machine can only run one model at a time).");
      return;
    }
    runInProgress = true;

    try {
      const { pdfBytes, models, fileName } = await parseMultipart(req);
      if (!pdfBytes) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("No file uploaded.");
        runInProgress = false;
        return;
      }

      res.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
      });

      // Clear anything left resident from a previous interrupted run
      // before starting — see unloadAllModels' own comment for why this
      // matters on CPU-only hardware.
      res.write(JSON.stringify({ type: "status", message: "Unloading any leftover models before starting..." }) + "\n");
      await unloadAllModels();

      const images = await renderPdfBytesToPngs(pdfBytes);
      const modelList = models.length > 0 ? models : SAFE_DEFAULT_MODELS;

      // Same convention as scripts/test-local-models.ts, so CLI and UI
      // results land in the same place and can be browsed together.
      const formName = (fileName ? fileName.replace(extname(fileName), "") : "upload") || "upload";
      const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
      const outDir = join("scripts", "results", `${formName}_${runStamp}`);
      await mkdir(outDir, { recursive: true });

      for (const model of modelList) {
        res.write(JSON.stringify({ type: "running", model }) + "\n");
        const result = await runModel(model, images);
        const parsed = tryParseJson(result.raw);

        const safeName = model.replace(/[/:]/g, "_");
        const outFile = join(outDir, `${safeName}.json`);
        await writeFile(
          outFile,
          JSON.stringify({ model, ok: result.ok, ms: result.ms, response: parsed ?? result.raw }, null, 2),
        );

        res.write(
          JSON.stringify({
            type: "done",
            model,
            ok: result.ok,
            ms: result.ms,
            parsed: parsed ?? undefined,
            raw: parsed ? undefined : result.raw,
            savedTo: outFile,
          }) + "\n",
        );
      }
      res.end();
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(error instanceof Error ? error.message : String(error));
    } finally {
      runInProgress = false;
      // Belt-and-braces: even though runModel() already unloads itself,
      // clear anything left resident after the whole batch too — cheap
      // and makes this server's failure mode "nothing loaded" rather than
      // relying on every individual call site to have gotten cleanup
      // exactly right.
      await unloadAllModels();
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

/** Minimal multipart/form-data parser — just enough for one file field and one text field. No dependency needed for this throwaway tool. */
async function parseMultipart(req: IncomingMessage): Promise<{ pdfBytes: Uint8Array | null; models: string[]; fileName: string | null }> {
  const contentType = req.headers["content-type"] ?? "";
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch) throw new Error("Missing multipart boundary.");
  const boundary = "--" + boundaryMatch[1];

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    total += chunk.length;
    if (total > MAX_UPLOAD_BYTES) throw new Error("File too large (50MB limit).");
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  const parts = splitBuffer(body, Buffer.from(boundary));

  let pdfBytes: Uint8Array | null = null;
  let models: string[] = [];
  let fileName: string | null = null;

  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const headerText = part.subarray(0, headerEnd).toString("utf8");
    const content = part.subarray(headerEnd + 4, part.length - 2); // strip trailing \r\n

    if (/name="file"/.test(headerText)) {
      pdfBytes = new Uint8Array(content);
      const nameMatch = headerText.match(/filename="([^"]*)"/);
      if (nameMatch) fileName = nameMatch[1];
    } else if (/name="models"/.test(headerText)) {
      models = content.toString("utf8").split(",").map((s) => s.trim()).filter(Boolean);
    }
  }

  return { pdfBytes, models, fileName };
}

function splitBuffer(buffer: Buffer, delimiter: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  while (true) {
    const idx = buffer.indexOf(delimiter, start);
    if (idx === -1) break;
    if (idx > start) parts.push(buffer.subarray(start, idx));
    start = idx + delimiter.length;
  }
  return parts;
}

server.listen(PORT, () => {
  console.log(`Model comparison UI running at http://localhost:${PORT}`);
  console.log("Fully local — talks only to this machine's Ollama daemon, no external calls.");
});
