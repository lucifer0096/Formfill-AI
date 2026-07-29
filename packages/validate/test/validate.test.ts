import { describe, expect, it } from 'vitest';
import type { Field } from '@formfill/form-model';
import { parseDate, validate } from '@formfill/validate';

const field = (over: Partial<Field>): Field => ({
  id: 'f',
  label: 'Label',
  spokenLabel: 'Question',
  type: 'text',
  required: true,
  constraints: {},
  sensitivity: 'none',
  confidence: 1,
  anchor: { kind: 'acroform', fieldName: 'f' },
  ...over,
});

describe('date parsing', () => {
  it.each([
    ['3 3 1954', '1954-03-03'],
    ['3/3/1954', '1954-03-03'],
    ['03.03.1954', '1954-03-03'],
    ['1954-03-03', '1954-03-03'],
    ['3 March 1954', '1954-03-03'],
    ['15 Dec 2001', '2001-12-15'],
  ])('accepts %s the way people actually say it', (input, iso) => {
    expect(parseDate(input)?.toISOString().slice(0, 10)).toBe(iso);
  });

  it('is day-first for en-GB and month-first for en-US', () => {
    expect(parseDate('3/4/1954', 'en-GB')?.getUTCMonth()).toBe(3); // April
    expect(parseDate('3/4/1954', 'en-US')?.getUTCMonth()).toBe(2); // March
  });

  it('rejects dates that do not exist', () => {
    expect(parseDate('31 2 2001')).toBeNull();
  });
});

describe('validation messages', () => {
  it('leads with the question, never says "invalid input"', () => {
    const r = validate(field({ type: 'email' }), 'not-an-email');
    expect(r.ok).toBe(false);
    expect(r.message).not.toMatch(/invalid/i);
    expect(r.message).toContain('at sign');
  });

  it('normalises rather than rejecting where it reasonably can', () => {
    expect(validate(field({ type: 'currency' }), '£1,200').normalised).toBe('1200');
    expect(validate(field({ type: 'boolean' }), 'Yes').normalised).toBe(true);
    expect(
      validate(field({ profileKey: 'postalCode' }), 'sw1a 1aa').normalised,
    ).toBe('SW1A 1AA');
  });

  it('accepts an empty answer only when the field is optional', () => {
    expect(validate(field({ required: true }), '').ok).toBe(false);
    expect(validate(field({ required: false }), '').ok).toBe(true);
  });

  it('rejects a future date of birth', () => {
    expect(validate(field({ type: 'date' }), '1 1 2099').ok).toBe(false);
  });

  it('validates national ID by semantic key, not by label wording', () => {
    const ni = field({ profileKey: 'nationalId' });
    expect(validate(ni, 'AB123456C', 'en-GB').ok).toBe(true);
    expect(validate(ni, 'DA123456A', 'en-GB').ok).toBe(false); // D is a disallowed first letter
    expect(validate(ni, '123-45-6789', 'en-US').ok).toBe(true);
  });

  it('reads back the choice list when an option is not recognised', () => {
    const f = field({
      type: 'choice',
      constraints: {
        options: [
          { value: 'a', label: 'Adult' },
          { value: 'c', label: 'Junior' },
        ],
      },
    });
    expect(validate(f, 'grown up').message).toContain('Adult, Junior');
    expect(validate(f, 'Adult').normalised).toBe('a');
  });

  it('never accepts a signature digitally', () => {
    expect(validate(field({ type: 'signature' }), 'Priya Sharma').ok).toBe(false);
  });
});
