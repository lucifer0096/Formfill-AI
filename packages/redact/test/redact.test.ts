import { describe, expect, it } from 'vitest';
import { assertNoObviousPii, redactBlocks, rehydrate, type TextBlock } from '@formfill/redact';

/**
 * RECALL IS THE SAFETY METRIC. A false positive costs a slightly worse Form IR;
 * a false negative is a leak. These tests are written to catch misses, and the
 * corpus below should grow every time a real-world miss is found.
 */

const block = (text: string, id = 'b1'): TextBlock => ({
  id,
  text,
  page: 0,
  rect: { x: 0, y: 0, width: 100, height: 10 },
});

describe('redaction', () => {
  it('replaces PII with typed, numbered placeholders', () => {
    const { blocks } = redactBlocks([
      block('Name: Priya Sharma  NI: AB 12 34 56 C  Email: priya@example.com'),
    ]);
    const text = blocks[0]!.text;

    expect(text).not.toContain('Priya Sharma');
    expect(text).not.toContain('AB 12 34 56 C');
    expect(text).not.toContain('priya@example.com');
    expect(text).toMatch(/⟨PERSON_1⟩/);
    expect(text).toMatch(/⟨NATIONAL_ID_1⟩/);
    expect(text).toMatch(/⟨EMAIL_1⟩/);
  });

  it('gives the same value the same placeholder across blocks', () => {
    // The model needs to know two mentions are the same person without ever
    // being told who that person is.
    const { blocks } = redactBlocks([
      block('Name: Priya Sharma', 'a'),
      block('Signed: Priya Sharma', 'b'),
    ]);
    const first = /⟨PERSON_\d+⟩/.exec(blocks[0]!.text)?.[0];
    expect(first).toBeDefined();
    expect(blocks[1]!.text).toContain(first!);
  });

  it('leaves generic form labels alone', () => {
    const { blocks } = redactBlocks([
      block('Please indicate any accessible formats required'),
    ]);
    expect(blocks[0]!.text).toBe('Please indicate any accessible formats required');
  });

  it.each([
    ['UK NI number', 'National Insurance: AB123456C', 'AB123456C'],
    ['US SSN', 'Social Security: 123-45-6789', '123-45-6789'],
    ['UK postcode', 'Address: 10 Downing St, SW1A 2AA', 'SW1A 2AA'],
    ['email', 'E-mail: a.person@sub.example.co.uk', 'a.person@sub.example.co.uk'],
    ['phone', 'Tel: +44 20 7946 0958', '7946'],
    ['date of birth', 'D.O.B: 03/03/1954', '03/03/1954'],
    ['NHS number', 'NHS: 943 476 5919', '943 476 5919'],
  ])('catches %s', (_label, input, secret) => {
    const { blocks } = redactBlocks([block(input)]);
    expect(blocks[0]!.text).not.toContain(secret);
  });

  it('rehydrates model output locally', () => {
    const { blocks, map } = redactBlocks([block('Name: Priya Sharma')]);
    const modelOutput = { label: blocks[0]!.text, nested: [blocks[0]!.text] };
    const restored = rehydrate(modelOutput, map);

    expect(restored.label).toContain('Priya Sharma');
    expect(restored.nested[0]).toContain('Priya Sharma');
  });

  it('never persists the map in the outbound payload shape', () => {
    const { blocks, map } = redactBlocks([block('Name: Priya Sharma')]);
    // The payload is built from `blocks` only; `map` stays in worker memory.
    expect(JSON.stringify(blocks)).not.toContain('Priya Sharma');
    expect(map.entries.size).toBeGreaterThan(0);
  });

  it('fails closed at the network boundary', () => {
    expect(() => assertNoObviousPii({ blocks: [block('Name: Priya Sharma')] })).toThrow(
      /possible PII/,
    );
  });
});
