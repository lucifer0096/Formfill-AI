import { detect, type PiiKind, type PiiSpan } from './detectors.js';

export * from './detectors.js';

/**
 * Redaction: the gate between the device and the network.
 *
 * Nothing reaches `/api/understand` without passing through `redactBlocks`.
 * Placeholders are TYPED and NUMBERED so the model keeps the structural signal
 * it needs ("this is a person's name, and it is the same person as three lines
 * above") without ever receiving the value.
 *
 * The rehydration map lives in worker memory for the lifetime of one request.
 * It is never persisted and never transmitted. See docs/PRIVACY.md §3.
 */

export interface TextBlock {
  id: string;
  text: string;
  page: number;
  rect: { x: number; y: number; width: number; height: number };
}

export interface RedactionMap {
  /** placeholder -> original text. Local only, request-scoped. */
  entries: Map<string, string>;
}

export interface RedactionResult {
  blocks: TextBlock[];
  map: RedactionMap;
  /** Counts by kind, safe to log — no values. */
  stats: Record<string, number>;
}

const placeholder = (kind: PiiKind, n: number) => `⟨${kind}_${n}⟩`;

/** Thrown when redaction cannot complete. Callers MUST fail closed. */
export class RedactionError extends Error {}

/**
 * Redact a set of extracted text blocks.
 *
 * FAIL-CLOSED CONTRACT: if this throws, the caller must not make the network
 * call. Falling back to sending unredacted text would defeat the entire privacy
 * model, so there is deliberately no "skip redaction" option anywhere.
 */
export function redactBlocks(blocks: TextBlock[]): RedactionResult {
  const map: RedactionMap = { entries: new Map() };
  const seen = new Map<string, string>(); // original -> placeholder, for consistency
  const counters = new Map<PiiKind, number>();
  const stats: Record<string, number> = {};

  const out = blocks.map((block) => {
    let spans: PiiSpan[];
    try {
      spans = detect(block.text);
    } catch (cause) {
      throw new RedactionError(`Detector failed on block ${block.id}`, { cause });
    }

    let text = block.text;
    // Replace from the end so earlier offsets stay valid.
    for (const span of [...spans].sort((a, b) => b.start - a.start)) {
      let token = seen.get(span.text);
      if (!token) {
        const n = (counters.get(span.kind) ?? 0) + 1;
        counters.set(span.kind, n);
        token = placeholder(span.kind, n);
        seen.set(span.text, token);
        map.entries.set(token, span.text);
      }
      stats[span.kind] = (stats[span.kind] ?? 0) + 1;
      text = text.slice(0, span.start) + token + text.slice(span.end);
    }

    return { ...block, text };
  });

  return { blocks: out, map, stats };
}

/**
 * Restore original values in model output, locally, before the IR reaches the
 * UI. Applied to every string in the returned structure.
 */
export function rehydrate<T>(value: T, map: RedactionMap): T {
  if (typeof value === 'string') {
    let out = value;
    for (const [token, original] of map.entries) {
      out = out.split(token).join(original);
    }
    return out as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => rehydrate(v, map)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, rehydrate(v, map)]),
    ) as T;
  }
  return value;
}

/**
 * Belt-and-braces assertion for the network boundary. Cheap enough to run on
 * every outbound payload, and it turns a silent leak into a loud failure.
 */
export function assertNoObviousPii(payload: unknown): void {
  const serialised = JSON.stringify(payload);
  const spans = detect(serialised).filter((s) => s.kind !== 'DOB' && s.kind !== 'ACCOUNT');
  if (spans.length > 0) {
    const kinds = [...new Set(spans.map((s) => s.kind))].join(', ');
    throw new RedactionError(`Outbound payload still contains possible PII: ${kinds}`);
  }
}
