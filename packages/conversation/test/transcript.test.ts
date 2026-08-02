import { describe, expect, it } from 'vitest';
import { libraryMembership } from '@formfill/fixtures';
import type { Field } from '@formfill/form-model';
import {
  initialState,
  step,
  type ConversationEvent,
  type ConversationState,
} from '@formfill/conversation';

/**
 * TRANSCRIPT TESTS
 *
 * The unit under test is what the user HEARS. Driving the engine through a
 * script and snapshotting the resulting announcements makes every change to the
 * spoken experience show up as a reviewable diff — you read the transcript in
 * the PR the way a user would hear it. This is the highest-value test in the
 * repo; accessibility regressions are otherwise silent.
 */

function run(events: ConversationEvent[], deps = {}) {
  let state: ConversationState = initialState(libraryMembership);
  const transcript: string[] = [];
  for (const event of events) {
    const result = step(state, event, { now: () => '2026-07-29T00:00:00.000Z', ...deps });
    state = result.state;
    for (const a of result.announcements) transcript.push(`[${a.kind}] ${a.text}`);
  }
  return { state, transcript };
}

describe('conversation transcript', () => {
  it('walks a form from start to confirmation', () => {
    const { state, transcript } = run([
      { type: 'START' },
      { type: 'ANSWER', value: 'Priya Sharma' },
      { type: 'ANSWER', value: '3 3 1954' },
      { type: 'ANSWER', value: 'priya@example.com' },
      { type: 'ANSWER', value: 'SW1A 1AA' },
      { type: 'ANSWER', value: 'adult' },
      { type: 'ANSWER', value: ['braille', 'audio'] },
      { type: 'ANSWER', value: 'no' },
      { type: 'SKIP' }, // signature — never signed digitally
      // Falling off the last question lands in review automatically; walk it.
      { type: 'NEXT' },
      { type: 'NEXT' },
      { type: 'NEXT' },
      { type: 'NEXT' },
      { type: 'NEXT' },
      { type: 'NEXT' },
      { type: 'NEXT' },
      { type: 'CONFIRM' },
    ]);

    expect(state.phase).toBe('complete');
    expect(transcript).toMatchSnapshot();
  });

  it('will not confirm answers the user has not heard read back', () => {
    const answered: ConversationEvent[] = [
      { type: 'START' },
      { type: 'ANSWER', value: 'Priya Sharma' },
      { type: 'ANSWER', value: '3 3 1954' },
      { type: 'ANSWER', value: '' },
      { type: 'ANSWER', value: 'SW1A 1AA' },
      { type: 'ANSWER', value: 'adult' },
      { type: 'ANSWER', value: [] },
      { type: 'ANSWER', value: 'no' },
      { type: 'SKIP' },
    ];

    // Confirming straight away is refused the first time...
    const first = run([...answered, { type: 'CONFIRM' }]);
    expect(first.state.phase).toBe('reviewing');
    expect(first.transcript.at(-1)).toContain('have not heard 7 of your 8 answers');

    // ...but an expert user is not trapped: a second C proceeds.
    const second = run([...answered, { type: 'CONFIRM' }, { type: 'CONFIRM' }]);
    expect(second.state.phase).toBe('complete');
  });

  it('never reads a branch whose condition is unmet', () => {
    const { transcript } = run([
      { type: 'START' },
      { type: 'ANSWER', value: 'Priya Sharma' },
      { type: 'ANSWER', value: '3 3 1954' },
      { type: 'ANSWER', value: '' },
      { type: 'ANSWER', value: 'SW1A 1AA' },
      { type: 'ANSWER', value: 'adult' },
    ]);
    expect(transcript.join('\n')).not.toContain('Which benefit do you receive');
  });

  it('reads the conditional branch once its condition is met', () => {
    const { transcript } = run([
      { type: 'START' },
      { type: 'ANSWER', value: 'Priya Sharma' },
      { type: 'ANSWER', value: '3 3 1954' },
      { type: 'ANSWER', value: '' },
      { type: 'ANSWER', value: 'SW1A 1AA' },
      { type: 'ANSWER', value: 'concession' },
    ]);
    expect(transcript.join('\n')).toContain('Which benefit do you receive');
  });

  it('speaks dates the way a person would say them', () => {
    const { transcript } = run([
      { type: 'START' },
      { type: 'ANSWER', value: 'Priya Sharma' },
      { type: 'ANSWER', value: '3 3 1954' },
    ]);
    expect(transcript.join('\n')).toContain('the 3rd of March 1954');
  });

  it('flags a question it was unsure of', () => {
    // The `marketing` field has confidence 0.52 in the fixture.
    const { transcript } = run([
      { type: 'START' },
      { type: 'ANSWER', value: 'Priya Sharma' },
      { type: 'ANSWER', value: '3 3 1954' },
      { type: 'ANSWER', value: '' },
      { type: 'ANSWER', value: 'SW1A 1AA' },
      { type: 'ANSWER', value: 'adult' },
      { type: 'ANSWER', value: [] },
    ]);
    expect(transcript.join('\n')).toContain("I'm not certain I read this question correctly");
  });

  it('keeps the verbatim label one keystroke away', () => {
    const { transcript } = run([{ type: 'START' }, { type: 'VERBATIM' }]);
    expect(transcript.at(-1)).toContain(
      'As printed: Full name of applicant (as it appears on proof of identity)',
    );
  });

  it('re-asks rather than accepting an invalid answer', () => {
    const { state, transcript } = run([
      { type: 'START' },
      { type: 'ANSWER', value: 'Priya Sharma' },
      { type: 'ANSWER', value: '3 3 2099' },
    ]);
    expect(transcript.at(-1)).toContain('in the future');
    expect(state.cursor).toBe('dob'); // cursor did not move on
  });

  it('offers profile values but never applies them silently', () => {
    const suggest = (f: Field) => (f.profileKey === 'fullName' ? 'Priya Sharma' : null);
    const { state, transcript } = run([{ type: 'START' }], { suggest });

    expect(transcript.join('\n')).toContain('Press Enter to use it');
    // Crucially: nothing is recorded until the user accepts.
    expect(state.answers['full-name']).toBeUndefined();

    const accepted = step(state, { type: 'ACCEPT_SUGGESTION' }, { suggest });
    expect(accepted.state.answers['full-name']?.value).toBe('Priya Sharma');
    expect(accepted.state.answers['full-name']?.source).toBe('profile');
  });

  it('refuses to confirm while required answers are outstanding', () => {
    const { state, transcript } = run([
      { type: 'START' },
      { type: 'REVIEW' },
      { type: 'CONFIRM' },
    ]);
    expect(state.phase).not.toBe('complete');
    expect(transcript.join('\n')).toContain('still unanswered');
  });

  it('routes every field through review before completion', () => {
    const { state } = run([
      { type: 'START' },
      { type: 'ANSWER', value: 'Priya Sharma' },
      { type: 'ANSWER', value: '3 3 1954' },
      { type: 'ANSWER', value: '' },
      { type: 'ANSWER', value: 'SW1A 1AA' },
      { type: 'ANSWER', value: 'adult' },
      { type: 'ANSWER', value: [] },
      { type: 'ANSWER', value: 'no' },
      { type: 'SKIP' },
    ]);
    // Falling off the end of the questions lands in review, not completion.
    expect(state.phase).toBe('reviewing');
  });

  it('never accepts a digital signature', () => {
    const { transcript } = run([
      { type: 'START' },
      { type: 'GOTO', fieldId: 'signature' },
      { type: 'ANSWER', value: 'Priya Sharma' },
    ]);
    expect(transcript.at(-1)).toContain('handwritten signature');
  });
});
