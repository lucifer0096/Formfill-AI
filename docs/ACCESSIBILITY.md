# MFIF — Accessibility Specification

**Status:** Draft v0.1 · 2026-07-29
**Conformance target:** WCAG 2.2 **AA** minimum, AAA where cheap. EN 301 549 / Section 508 alignment assumed.

This is a **normative spec**, not advice. For an app whose users are blind, accessibility defects are functional defects. Treat a violation here as a P0 bug.

---

## 1. The two-audience problem

MFIF must serve two populations with directly conflicting needs:

| | **Screen-reader users** (Priya) | **No-screen-reader users** (Alan) |
|---|---|---|
| Speech | Their SR speaks. **The app must be silent.** | Nothing speaks. **The app must speak.** |
| Navigation | Standard focus + SR virtual cursor | Single-key commands, large buttons |
| Pace | Fast, terse, no hand-holding | Slow, verbose, repeatable |

Getting this wrong produces the two worst failure modes in the product: **double-speaking** (app and screen reader talking over each other — completely unusable) and **silence** (a blind user with no screen reader facing a mute app — completely unusable).

### 1.1 Mode resolution

The app runs in exactly one of two modes, resolved at startup and re-resolvable at any time:

- **`sr` mode** — app is acoustically silent; all output goes through ARIA live regions and focus management.
- **`spoken` mode** — app drives Speech Synthesis directly; live regions still populated but redundant.

Detection order:
1. **Explicit user setting** — persisted, always wins. Offered on first run as a spoken *and* visual question with two enormous buttons: *"Do you already use a screen reader?"*
2. **Heuristics** (best-effort only, never authoritative): `navigator.userActivation` patterns, virtual-cursor-style rapid focus traversal, absence of pointer events combined with heavy arrow-key use, `prefers-reduced-motion` + platform hints.
3. **Default when unknown:** `sr` mode. Silence is recoverable — the user hits the persistent "Read aloud" control. Double-speech is not; it drives users off immediately.

A global toggle (`Ctrl`+`Alt`+`S`) switches modes at any moment and announces the change in the mode it is switching *to*.

> **Rule:** exactly one component in the codebase may call `speechSynthesis.speak()` — the `speech` package's announcement queue. Enforced by ESLint `no-restricted-globals`. This is the only defensible way to guarantee the app never talks over a screen reader.

## 2. Announcements

The conversation engine emits `Announcement { text, priority, interruptible }`. The presentation layer is the only thing that knows about modes.

| priority | `sr` mode | `spoken` mode |
|---|---|---|
| `polite` | `aria-live="polite"` region | queued speech |
| `assertive` | `aria-live="assertive"` + focus move | speech, interrupts current utterance |

Rules:
- **Never** more than one assertive announcement per user action.
- Every announcement is repeatable with `Space`. Users mishear; a UI that can't repeat itself is a UI that fails.
- Progress is announced on a **coarse** cadence ("page 2 of 4"), never per-percent. Chatty progress destroys a voice interface.
- Errors are announced with the field name first: *"Date of birth — that date is in the future."* Not *"Invalid input."*

## 3. Keyboard

Everything is reachable and operable by keyboard. No exceptions, no mouse-only affordances, no drag-and-drop without a keyboard equivalent.

**Global**

| Key | Action |
|---|---|
| `Ctrl`+`Alt`+`S` | toggle spoken / screen-reader mode |
| `Ctrl`+`Alt`+`H` | help |
| `Ctrl`+`Alt`+`Delete`… | *(not used — reserved by OS)* |
| `Esc` | cancel current operation, never loses answers |

**Spoken mode, single-key (only when focus is not in a text input)**

| Key | Action |
|---|---|
| `N` / `→` | next field |
| `P` / `←` | previous field |
| `Space` | repeat current question |
| `H` | explain this question in plain language |
| `L` | read the **verbatim original label** |
| `R` | jump to review |
| `S` | skip this field |
| `1`–`9` | select nth option in a choice field |

Single-key commands are suspended whenever a text input has focus — a hard rule, and a classic source of "the app ate my typing" bugs.

**Focus management**
- Focus moves to each field as it becomes current; never trapped except in genuine modals (which have `role="dialog"`, `aria-modal`, and restore focus on close).
- Visible focus indicator: ≥ 3:1 contrast against adjacent colours, ≥ 2 px, never removed (WCAG 2.2 **2.4.11 Focus Not Obscured**, **2.4.13 Focus Appearance**).
- Route changes move focus to the new `<h1>` and announce it.

## 4. Visual design (low-vision requirements)

These are the users who are *not* using a screen reader, and they are the majority of the visually impaired population.

- **Contrast:** 7:1 for body text (AAA), 4.5:1 minimum for anything, 3:1 for UI components and focus rings.
- **Type:** base 20 px, scalable to 400 % with no loss of content or horizontal scrolling (WCAG **1.4.10 Reflow**, **1.4.4 Resize Text**). Layout in `rem`, never `px` for text. No `maximum-scale` in the viewport meta — ever.
- **Targets:** minimum 44 × 44 CSS px (exceeds WCAG 2.2 **2.5.8**'s 24 px floor; 44 is the usable number).
- **One question per screen** in spoken mode, in very large type, high contrast, with generous whitespace.
- **Themes:** light, dark, and high-contrast; respect `prefers-color-scheme` and `prefers-contrast`. Honour Windows High Contrast / forced-colors mode — no `background-image`-only affordances.
- **Motion:** respect `prefers-reduced-motion`; no animation is required to understand state.
- **Never colour alone** to convey meaning — errors carry an icon and text (WCAG **1.4.1**).
- **No time limits** anywhere in MFIF's own UI (WCAG **2.2.1**). Where the *underlying* web form imposes one, detect it, warn early, and offer to extend or save a draft.

## 5. Forms & errors

- Every input has a programmatically associated `<label>`. `aria-label` only where a visible label genuinely cannot exist.
- `aria-describedby` links help text, format hints, and error messages.
- `aria-invalid` and `aria-required` reflect real state.
- **Error identification** (WCAG **3.3.1**), **suggestion** (**3.3.3**), and **error prevention for legal/financial data** (**3.3.4**) — the mandatory review gate satisfies 3.3.4.
- **Redundant entry** (WCAG 2.2 **3.3.7**): the profile autofill exists precisely to satisfy this. Never ask twice for the same value in one session.
- **Accessible authentication** (WCAG 2.2 **3.3.8**): no cognitive-function tests. Passphrase paste is permitted; WebAuthn preferred.
- Format hints are spoken *before* the input is expected, not after failure: *"Date of birth, day month year, for example 3 3 1954."*

## 6. Speech input

- Never the only input method. Typing always works.
- Prefer the **OS's own dictation** (the user's existing, trusted, configured tool) over Web Speech API where available.
- Cloud speech recognition is **opt-in**, disclosed, and **hard-blocked on `sensitivity: 'sensitive'` fields** (national ID, health, financial). This is enforced in `speech`, not in UI code.
- Recognised text is always read back before acceptance. Speech recognition on names, postcodes and ID numbers is error-prone; unverified acceptance would corrupt exactly the fields that matter most.

## 7. Content & language

- `spokenLabel` targets a reading age of ~12 and never removes a negation or a qualifier. "Do not tick if…" must survive rewriting intact — an inverted question is a data-integrity bug, not a style issue.
- The **verbatim** `label` is always one keystroke away (`L`). We paraphrase to help; we never hide the original.
- Numbers, dates and currency are spoken naturally: "three thousand two hundred pounds", not "3200".
- Abbreviations expanded on first use per section.
- Page `<title>`, `lang` attribute, and heading hierarchy correct on every route.

## 8. Definition of done (per PR)

- [ ] axe-core: zero violations on affected routes
- [ ] Full task completable keyboard-only, verified
- [ ] Tested with at least one real screen reader (NVDA or VoiceOver)
- [ ] Announcement transcript snapshot reviewed — read it as if you were hearing it
- [ ] 400 % zoom, no horizontal scroll, no clipped content
- [ ] `forced-colors: active` renders correctly
- [ ] No new call site of `speechSynthesis` outside `packages/speech`
- [ ] Any new field type has a spoken format hint and a validator

## 9. References

- WCAG 2.2 — https://www.w3.org/TR/WCAG22/
- ARIA Authoring Practices Guide — https://www.w3.org/WAI/ARIA/apg/
- WebAIM screen-reader user survey (navigation habits, mode expectations)
- EN 301 549 (EU procurement), Section 508 (US federal)
