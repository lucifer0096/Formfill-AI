/**
 * Browser UI for comparing OpenRouter (cloud) models against real forms —
 * NOT part of the app, separate port, separate process. Run with
 * `npm run test:online`, then open http://localhost:3200. Upload one or
 * more PDFs at once, watch each file/model result stream in, and see a
 * consolidated summary once every file is done. Same UI shape as
 * test-ui-server.ts (the local Ollama tool).
 *
 * FREE MODELS ONLY (see online-test-lib.ts's ALL_MODELS) — no money has
 * been loaded into the OpenRouter account, so this tool intentionally
 * excludes paid models rather than merely gating them behind a warning.
 */
import { createServer, type IncomingMessage } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { config } from "dotenv";
import { ALL_MODELS, DEFAULT_MODELS, runOnlineModel, tryParseJson, toForm } from "./online-test-lib";

config({ path: ".env.local" });

const PORT = Number(process.env.TEST_ONLINE_PORT ?? 3200);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB per file, matches the app's own upload limit
const MAX_FILES_PER_RUN = 15; // sane ceiling on a single batch

let runInProgress = false;

const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FormFill — online (OpenRouter) model comparison</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: Canvas; color: CanvasText; line-height: 1.5;
  }
  h1 { font-size: 1.4rem; margin: 0 0 0.25rem; }
  .sub { color: GrayText; margin: 0 0 1.5rem; font-size: 0.9rem; }
  .warn {
    border: 1px solid #2F6B47; background: #E2EEE7; color: #2F6B47;
    border-radius: 6px; padding: 0.75rem 1rem; margin: 0 0 1.5rem; font-size: 0.85rem;
  }
  .panel {
    border: 1px solid color-mix(in srgb, CanvasText 20%, transparent);
    border-radius: 8px; padding: 1.25rem; margin-bottom: 1.5rem;
  }
  .row { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; margin-bottom: 1rem; }
  button {
    font: inherit; padding: 0.55rem 1.1rem; border-radius: 6px; border: 1px solid transparent;
    background: #1F4FD8; color: #fff; cursor: pointer; font-weight: 600;
  }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  input[type="file"] { font: inherit; }
  .filelist { font-size: 0.85rem; color: GrayText; margin: 0.5rem 0 0; }
  .summary {
    border: 1px solid color-mix(in srgb, CanvasText 20%, transparent);
    border-radius: 8px; padding: 1.25rem; margin-bottom: 1.5rem;
  }
  .summary table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  .summary th, .summary td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid color-mix(in srgb, CanvasText 15%, transparent); }
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
  h2.form-heading { font-size: 1.05rem; margin: 2rem 0 0.75rem; }
  h2.form-heading:first-of-type { margin-top: 0; }
</style>
</head>
<body>
  <h1>FormFill — online (OpenRouter) model comparison</h1>
  <p class="sub">Upload one or more real form PDFs, run them all through OpenRouter, and see a consolidated summary once every file is done.</p>
  <p class="warn">Free tier only — <code>${ALL_MODELS.join(", ")}</code>. No paid models are available here, so a run can never spend money.</p>

  <div class="panel">
    <div class="row">
      <input type="file" id="file" accept="application/pdf" multiple />
      <button id="run" disabled>Run comparison</button>
    </div>
    <p class="filelist" id="fileList"></p>
  </div>

  <div id="summaryWrap"></div>
  <div class="grid" id="grid"></div>

<script>
  const fileInput = document.getElementById('file');
  const runBtn = document.getElementById('run');
  const fileList = document.getElementById('fileList');
  const grid = document.getElementById('grid');
  const summaryWrap = document.getElementById('summaryWrap');

  fileInput.addEventListener('change', () => {
    const files = [...fileInput.files];
    runBtn.disabled = files.length === 0;
    fileList.textContent = files.length
      ? files.length + ' file(s) selected: ' + files.map((f) => f.name).join(', ')
      : '';
  });

  function fieldCount(parsed) {
    if (!parsed || !Array.isArray(parsed.sections)) return null;
    return parsed.sections.reduce((sum, s) => sum + (Array.isArray(s.fields) ? s.fields.length : 0), 0);
  }

  runBtn.addEventListener('click', async () => {
    const files = [...fileInput.files];
    if (files.length === 0) return;

    runBtn.disabled = true;
    grid.innerHTML = '';
    summaryWrap.innerHTML = '';
    const cards = {};
    const summaryRows = []; // { file, ok, ms, count }

    for (const file of files) {
      const heading = document.createElement('h2');
      heading.className = 'form-heading';
      heading.textContent = file.name;
      grid.parentElement.insertBefore(heading, grid);
    }

    const formData = new FormData();
    for (const file of files) formData.append('files', file, file.name);

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
        const key = event.file + '::' + event.model;
        if (event.type === 'running') {
          const card = document.createElement('div');
          card.className = 'card';
          card.innerHTML = \`<h3><span>\${event.model}</span><span class="status running" data-status>running</span></h3>
            <p class="meta" data-meta></p>
            <pre data-out>—</pre>\`;
          grid.appendChild(card);
          cards[key] = card;
        } else if (event.type === 'done') {
          const card = cards[key];
          if (!card) continue;
          const statusEl = card.querySelector('[data-status]');
          const metaEl = card.querySelector('[data-meta]');
          const outEl = card.querySelector('[data-out]');
          statusEl.textContent = event.ok ? 'ok' : 'failed';
          statusEl.className = 'status ' + (event.ok ? 'ok' : 'error');
          const seconds = (event.ms / 1000).toFixed(1);
          const count = fieldCount(event.parsed);
          metaEl.innerHTML = seconds + 's' + (count !== null ? ' · <span class="field-count">' + count + '</span> fields detected' : '')
            + (event.savedTo ? ' · saved to <code>' + event.savedTo + '</code>' : '');
          outEl.textContent = JSON.stringify(event.parsed ?? event.raw, null, 2);
          summaryRows.push({ file: event.file, ok: event.ok, ms: event.ms, count, title: event.parsed && event.parsed.title });
        } else if (event.type === 'run-complete') {
          // Consolidated summary table, once every file/model pair is done.
          const rows = summaryRows.map((r) =>
            '<tr><td>' + r.file + '</td><td>' + (r.title || '—') + '</td>' +
            '<td>' + (r.ok ? 'OK' : 'FAILED') + '</td>' +
            '<td>' + (r.ms / 1000).toFixed(1) + 's</td>' +
            '<td>' + (r.count === null || r.count === undefined ? '—' : r.count) + '</td></tr>'
          ).join('');
          summaryWrap.innerHTML = '<div class="summary"><h2 class="form-heading" style="margin-top:0">Consolidated summary</h2>' +
            '<table><thead><tr><th>File</th><th>Detected title</th><th>Result</th><th>Time</th><th>Fields</th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table></div>';
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
      res.end("A comparison is already running — wait for it to finish before starting another.");
      return;
    }
    runInProgress = true;

    try {
      const { files } = await parseMultipart(req);
      if (files.length === 0) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("No files uploaded.");
        runInProgress = false;
        return;
      }
      if (files.length > MAX_FILES_PER_RUN) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end(`Too many files (${files.length}). Max ${MAX_FILES_PER_RUN} per run.`);
        runInProgress = false;
        return;
      }
      if (!process.env.OPENROUTER_API_KEY) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("OPENROUTER_API_KEY is not set. Copy .env.local.example to .env.local and add your key.");
        runInProgress = false;
        return;
      }

      res.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
      });

      const modelList = DEFAULT_MODELS;

      for (const file of files) {
        const fileName = file.fileName ?? "upload.pdf";
        const formName = fileName.replace(extname(fileName), "") || "upload";
        // Separate top-level folder from the local tool's scripts/results/ —
        // keeps cloud results clearly apart from local Ollama results, one
        // subfolder per form, same per-model file naming.
        const outDir = join("scripts", "online-model-results", formName);
        await mkdir(outDir, { recursive: true });

        for (const model of modelList) {
          res.write(JSON.stringify({ type: "running", file: fileName, model }) + "\n");
          const result = await runOnlineModel(model, file.bytes, fileName);
          const parsed = tryParseJson(result.raw);
          const form = parsed ? toForm(parsed as Parameters<typeof toForm>[0], fileName, 1) : undefined;

          const safeName = model.replace(/[/:]/g, "_");
          const outFile = join(outDir, `${safeName}.json`);
          await writeFile(
            outFile,
            JSON.stringify({ model, ok: result.ok, ms: result.ms, response: parsed ?? result.raw }, null, 2),
          );

          res.write(
            JSON.stringify({
              type: "done",
              file: fileName,
              model,
              ok: result.ok,
              ms: result.ms,
              parsed: form ? { title: form.title, sections: form.sections } : undefined,
              raw: parsed ? undefined : result.raw,
              savedTo: outFile,
            }) + "\n",
          );
        }
      }

      res.write(JSON.stringify({ type: "run-complete" }) + "\n");
      res.end();
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(error instanceof Error ? error.message : String(error));
    } finally {
      runInProgress = false;
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

interface UploadedFile {
  fileName: string | null;
  bytes: Uint8Array;
}

/** Minimal multipart/form-data parser — collects every "files" field (repeated), not just one. */
async function parseMultipart(req: IncomingMessage): Promise<{ files: UploadedFile[] }> {
  const contentType = req.headers["content-type"] ?? "";
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch) throw new Error("Missing multipart boundary.");
  const boundary = "--" + boundaryMatch[1];

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    total += chunk.length;
    if (total > MAX_UPLOAD_BYTES * MAX_FILES_PER_RUN) throw new Error("Upload too large.");
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  const parts = splitBuffer(body, Buffer.from(boundary));

  const files: UploadedFile[] = [];

  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const headerText = part.subarray(0, headerEnd).toString("utf8");
    const content = part.subarray(headerEnd + 4, part.length - 2);

    if (/name="files"/.test(headerText)) {
      const nameMatch = headerText.match(/filename="([^"]*)"/);
      files.push({ fileName: nameMatch ? nameMatch[1] : null, bytes: new Uint8Array(content) });
    }
  }

  return { files };
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
  console.log(`Online (OpenRouter) model comparison UI running at http://localhost:${PORT}`);
  console.log(`Free models only: ${ALL_MODELS.join(", ")}`);
});
