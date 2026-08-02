import {
  applicableFields,
  fieldById,
  isAnswered,
  needsAttention,
  outstandingFields,
  sectionOf,
} from "@/lib/form-model/traverse";
import type {
  Answer,
  AnswerSet,
  AnswerSource,
  Field,
  Form,
} from "@/lib/form-model/types";
import { validate } from "@/lib/validate";
import {
  confirmationText,
  questionText,
  say,
  speakValue,
  terminated,
  type Announcement,
} from "./announce";

/**
 * Ported from main's packages/conversation/src/machine.ts, unmodified logic.
 *
 * Pure and synchronous: `(state, event) -> (state, announcements)`. No DOM, no
 * I/O, no timers, no speech. This is deliberate — the conversation IS the
 * product (docs/DESIGN.md on main §3), and keeping it a pure reducer is what
 * makes it possible to snapshot-test exactly what a user will hear.
 *
 * Dependency rule: this module must never import an ingest or emit module.
 */

export type Phase = "loaded" | "asking" | "reviewing" | "complete";

export interface ConversationState {
  phase: Phase;
  form: Form;
  answers: AnswerSet;
  /** Field currently being asked. Null before START and after review begins. */
  cursor: string | null;
  /** Index into the review list while `phase === 'reviewing'`. */
  reviewIndex: number;
  /**
   * Ids of answers the user has actually heard read back. The review gate is
   * enforced against this, not against having merely opened the review.
   */
  reviewHeard: ReadonlySet<string>;
  /**
   * Set when the user tried to confirm without hearing every answer. A second
   * CONFIRM then proceeds — the gate is real, but an expert user is not trapped
   * behind eight forced read-backs.
   */
  confirmArmed: boolean;
  /** Pending autofill offer for the current field. Offered, never applied. */
  suggestion: { fieldId: string; value: string } | null;
  locale: string;
  /** Section id last announced, so section changes are called out exactly once. */
  lastSectionId: string | null;
}

export type ConversationEvent =
  | { type: "START" }
  | { type: "ANSWER"; value: string | string[] | boolean | null; source?: AnswerSource }
  | { type: "ACCEPT_SUGGESTION" }
  | { type: "SKIP" }
  | { type: "NEXT" }
  | { type: "PREV" }
  | { type: "REPEAT" }
  | { type: "HELP" }
  | { type: "VERBATIM" }
  | { type: "GOTO"; fieldId: string }
  | { type: "REVIEW" }
  | { type: "CONFIRM" };

export interface EngineDeps {
  /** Local profile lookup. Returns a value to OFFER, never to apply silently. */
  suggest?: (field: Field) => string | null;
  now?: () => string;
}

export interface StepResult {
  state: ConversationState;
  announcements: Announcement[];
}

export function initialState(form: Form, locale = "en-GB"): ConversationState {
  return {
    phase: "loaded",
    form,
    answers: {},
    cursor: null,
    reviewIndex: 0,
    reviewHeard: new Set(),
    confirmArmed: false,
    suggestion: null,
    locale,
    lastSectionId: null,
  };
}

/* -------------------------------------------------------------------------- */

export function step(
  state: ConversationState,
  event: ConversationEvent,
  deps: EngineDeps = {},
): StepResult {
  switch (event.type) {
    case "START":
      return start(state, deps);
    case "ANSWER":
      return answer(state, event.value, event.source ?? "typed", deps);
    case "ACCEPT_SUGGESTION":
      return state.suggestion
        ? answer(state, state.suggestion.value, "profile", deps)
        : noop(state, say("error", "There is nothing to accept here.", "assertive"));
    case "SKIP":
      return skip(state, deps);
    case "NEXT":
      return advance(state, +1, deps);
    case "PREV":
      return advance(state, -1, deps);
    case "REPEAT":
      return repeat(state);
    case "HELP":
      return help(state);
    case "VERBATIM":
      return verbatim(state);
    case "GOTO":
      return goto(state, event.fieldId, deps);
    case "REVIEW":
      return beginReview(state);
    case "CONFIRM":
      return confirm(state);
  }
}

/* -------------------------------------------------------------------------- */
/* Handlers                                                                    */
/* -------------------------------------------------------------------------- */

function start(state: ConversationState, deps: EngineDeps): StepResult {
  const fields = applicableFields(state.form, state.answers);
  if (fields.length === 0) {
    return {
      state: { ...state, phase: "complete" },
      announcements: [say("error", "I could not find any questions on this form.", "assertive")],
    };
  }

  const intro = say(
    "intro",
    `${state.form.title}. ${fields.length} questions. ` +
      `Press N for the next question, P to go back, space to repeat, H for help, ` +
      `and R to review your answers at any time.`,
    "assertive",
    false,
  );

  const moved = enter({ ...state, phase: "asking" }, fields[0]!.id, deps);
  return { state: moved.state, announcements: [intro, ...moved.announcements] };
}

function answer(
  state: ConversationState,
  value: string | string[] | boolean | null,
  source: AnswerSource,
  deps: EngineDeps,
): StepResult {
  const field = current(state);
  if (!field) return noop(state, say("error", "There is no question to answer right now.", "assertive"));

  const result = validate(field, value, state.locale);
  if (!result.ok) {
    // Field name first, then the problem. Never a bare "invalid input".
    return noop(
      state,
      say("error", `${field.spokenLabel}. ${result.message}`, "assertive", false),
    );
  }

  const stored = result.normalised ?? value;
  const next: Answer = {
    fieldId: field.id,
    value: stored,
    state: "filled",
    source,
    enteredAt: deps.now?.() ?? new Date().toISOString(),
  };

  const answers = { ...state.answers, [field.id]: next };
  const accepted = say(
    "accepted",
    confirmationText(field, speakValue(field, stored, state.locale)),
  );

  const moved = advance({ ...state, answers, suggestion: null }, +1, deps);
  return { state: moved.state, announcements: [accepted, ...moved.announcements] };
}

function skip(state: ConversationState, deps: EngineDeps): StepResult {
  const field = current(state);
  if (!field) return noop(state, say("error", "Nothing to skip.", "assertive"));

  const answers: AnswerSet = {
    ...state.answers,
    [field.id]: {
      fieldId: field.id,
      value: null,
      state: "skipped",
      source: "typed",
      enteredAt: deps.now?.() ?? new Date().toISOString(),
    },
  };

  const note = field.required
    ? say("error", "Skipped. This one is required, so I will bring you back to it at review.", "assertive")
    : say("accepted", "Skipped.");

  const moved = advance({ ...state, answers, suggestion: null }, +1, deps);
  return { state: moved.state, announcements: [note, ...moved.announcements] };
}

function advance(state: ConversationState, delta: 1 | -1, deps: EngineDeps): StepResult {
  // Recomputed each time: answering a question can add or remove later branches.
  const fields = applicableFields(state.form, state.answers);

  if (state.phase === "reviewing") {
    const idx = state.reviewIndex + delta;
    if (idx < 0) return noop(state, say("review", "This is the first answer."));
    if (idx >= fields.length) {
      return noop(state, say("review", "That is every answer. Press C to confirm and finish."));
    }
    return reviewLine({ ...state, reviewIndex: idx });
  }

  const index = fields.findIndex((f) => f.id === state.cursor);
  const target = index + delta;

  if (target < 0) {
    return noop(state, say("hint", "This is the first question."));
  }
  if (target >= fields.length) {
    return beginReview(state);
  }
  return enter(state, fields[target]!.id, deps);
}

function goto(state: ConversationState, fieldId: string, deps: EngineDeps): StepResult {
  if (!fieldById(state.form, fieldId)) {
    return noop(state, say("error", "I could not find that question.", "assertive"));
  }
  return enter({ ...state, phase: "asking" }, fieldId, deps);
}

/** Move the cursor to a field and produce everything the user should hear on arrival. */
function enter(state: ConversationState, fieldId: string, deps: EngineDeps): StepResult {
  const fields = applicableFields(state.form, state.answers);
  const position = fields.findIndex((f) => f.id === fieldId) + 1;
  const field = fieldById(state.form, fieldId)!;
  const announcements: Announcement[] = [];

  // Section changes give the user a sense of place in a long form.
  const section = sectionOf(state.form, fieldId);
  if (section?.title && section.id !== state.lastSectionId) {
    announcements.push(say("section", `Section: ${section.title}.`));
  }

  announcements.push(
    say("question", questionText(field, position, fields.length), "assertive", false),
  );

  // Autofill is OFFERED, never applied — a blind user cannot see what was
  // filled in, and a stale address on a benefits form is a real harm.
  let suggestion: ConversationState["suggestion"] = null;
  const existing = state.answers[fieldId];
  if (isAnswered(existing)) {
    announcements.push(
      say("hint", `Currently: ${speakValue(field, existing!.value, state.locale)}. Type to change it.`),
    );
  } else {
    const proposed = deps.suggest?.(field) ?? null;
    if (proposed) {
      suggestion = { fieldId, value: proposed };
      announcements.push(
        say(
          "suggestion",
          `I have ${speakValue(field, proposed, state.locale)} saved. Press Enter to use it, or type a different answer.`,
        ),
      );
    }
  }

  return {
    state: {
      ...state,
      phase: "asking",
      cursor: fieldId,
      suggestion,
      lastSectionId: section?.id ?? state.lastSectionId,
    },
    announcements,
  };
}

function repeat(state: ConversationState): StepResult {
  if (state.phase === "reviewing") return reviewLine(state);
  const field = current(state);
  if (!field) return noop(state, say("hint", "There is nothing to repeat."));
  const fields = applicableFields(state.form, state.answers);
  const position = fields.findIndex((f) => f.id === field.id) + 1;
  return noop(state, say("question", questionText(field, position, fields.length), "assertive", false));
}

function help(state: ConversationState): StepResult {
  const field = current(state);
  if (!field) return noop(state, say("help", "Press N for the next question, P to go back, R to review."));
  const text =
    field.help ??
    `This is asking for: ${field.spokenLabel}. Press L to hear it exactly as printed on the form.`;
  return noop(state, say("help", text, "assertive", false));
}

/**
 * The verbatim label is always one keystroke away. We paraphrase to help; we
 * never hide the original wording (docs/ACCESSIBILITY.md on main §7).
 */
function verbatim(state: ConversationState): StepResult {
  const field = current(state);
  if (!field) return noop(state, say("hint", "No question is selected."));
  return noop(state, say("verbatim", `As printed: ${field.label}`, "assertive", false));
}

/* -------------------------------------------------------------------------- */
/* Review — the mandatory gate. Nothing is emitted without passing through it.  */
/* -------------------------------------------------------------------------- */

function beginReview(state: ConversationState): StepResult {
  const fields = applicableFields(state.form, state.answers);
  const outstanding = outstandingFields(state.form, state.answers);
  const attention = needsAttention(state.form, state.answers);

  const summary = say(
    "summary",
    `Review. ${fields.length} questions. ` +
      (outstanding.length
        ? `${outstanding.length} required ${outstanding.length === 1 ? "question is" : "questions are"} still unanswered. `
        : "All required questions are answered. ") +
      (attention.length ? `${attention.length} need your attention. ` : "") +
      `I will read back every answer. Press N to move through them, G to go to a question, ` +
      `or C to confirm and finish.`,
    "assertive",
    false,
  );

  const reviewing: ConversationState = { ...state, phase: "reviewing", reviewIndex: 0, cursor: null };
  // Use the state returned by reviewLine, not `reviewing` — it carries the
  // record of which answers the user has actually heard, which the review gate
  // in confirm() depends on.
  const first = reviewLine(reviewing);
  return { state: first.state, announcements: [summary, ...first.announcements] };
}

function reviewLine(state: ConversationState): StepResult {
  const fields = applicableFields(state.form, state.answers);
  const field = fields[state.reviewIndex];
  if (!field) return noop(state, say("review", "That is the end of the review."));

  // Record that this answer was actually spoken. Only heard answers count
  // toward the review gate.
  const heard = new Set(state.reviewHeard);
  heard.add(field.id);
  const next: ConversationState = { ...state, reviewHeard: heard };

  const a = state.answers[field.id];
  const value = a ? speakValue(field, a.value, state.locale) : "not answered";
  const flags: string[] = [];
  if (a?.state === "skipped") flags.push("skipped");
  if (field.required && !isAnswered(a)) flags.push("required");
  if (field.type === "signature") flags.push("needs a handwritten signature");
  if (field.confidence < 0.6) flags.push("I was unsure of this question");

  const suffix = flags.length ? ` — ${flags.join(", ")}.` : "";
  return noop(
    next,
    say(
      "review",
      `${state.reviewIndex + 1}. ${terminated(field.spokenLabel)} ${terminated(value)}${suffix}`,
    ),
  );
}

function confirm(state: ConversationState): StepResult {
  if (state.phase !== "reviewing") {
    return noop(state, say("error", "Press R to review your answers first.", "assertive"));
  }

  const outstanding = outstandingFields(state.form, state.answers);
  if (outstanding.length > 0) {
    const first = outstanding[0]!;
    const moved = enter({ ...state, phase: "asking" }, first.id, {});
    return {
      state: moved.state,
      announcements: [
        say(
          "error",
          `${outstanding.length} required ${outstanding.length === 1 ? "question is" : "questions are"} still unanswered. ` +
            `Taking you to the first one.`,
          "assertive",
          false,
        ),
        ...moved.announcements,
      ],
    };
  }

  // THE REVIEW GATE (docs/DESIGN.md on main §4.4). Confirming without having
  // heard every answer read back is the failure this product exists to
  // prevent — the user cannot see the form, so the read-back is their only
  // check on it.
  const fields = applicableFields(state.form, state.answers);
  const unheard = fields.filter((f) => !state.reviewHeard.has(f.id));
  if (unheard.length > 0 && !state.confirmArmed) {
    return {
      state: { ...state, confirmArmed: true },
      announcements: [
        say(
          "error",
          `You have not heard ${unheard.length} of your ${fields.length} answers read back. ` +
            `Press N to hear them, or press C again to confirm anyway.`,
          "assertive",
          false,
        ),
      ],
    };
  }

  const answers = Object.fromEntries(
    Object.entries(state.answers).map(([id, a]) => [
      id,
      a.state === "filled" ? { ...a, state: "confirmed" as const } : a,
    ]),
  );

  const signatures = applicableFields(state.form, answers).filter((f) => f.type === "signature");
  const signatureNote = signatures.length
    ? ` ${signatures.length} ${signatures.length === 1 ? "field needs" : "fields need"} a handwritten signature — ` +
      `I will tell you where once the form is saved.`
    : "";

  return {
    state: { ...state, phase: "complete", answers },
    announcements: [
      say("complete", `All answers confirmed.${signatureNote} Ready to save your completed form.`, "assertive", false),
    ],
  };
}

/* -------------------------------------------------------------------------- */

function current(state: ConversationState): Field | undefined {
  return state.cursor ? fieldById(state.form, state.cursor) : undefined;
}

function noop(state: ConversationState, ...announcements: Announcement[]): StepResult {
  return { state, announcements };
}
