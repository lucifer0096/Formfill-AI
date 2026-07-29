import type { Form } from '@formfill/form-model';

/**
 * Hand-authored fixture forms.
 *
 * These exist so the conversation engine can be built and tested end-to-end
 * before any ingest code exists (docs/DESIGN.md §7, phase P0). They also carry
 * the awkward cases on purpose: officialese labels, skip logic, a signature
 * field, and one field with deliberately low confidence.
 */
export const libraryMembership: Form = {
  id: 'fixture-library-membership',
  title: 'Library membership application',
  source: 'pdf',
  locale: 'en-GB',
  provenance: {
    capturedAt: '2026-07-29T00:00:00.000Z',
    pageCount: 2,
    extractor: 'fixture',
    localOnly: true,
  },
  sections: [
    {
      id: 'about-you',
      title: 'About you',
      fields: [
        {
          id: 'full-name',
          label: 'Full name of applicant (as it appears on proof of identity)',
          spokenLabel: 'What is your full name?',
          help: 'Give your name exactly as it is written on the ID you will bring in — passport, driving licence, or bank statement.',
          type: 'name',
          required: true,
          constraints: { maxLength: 80 },
          sensitivity: 'pii',
          confidence: 0.98,
          anchor: { kind: 'acroform', fieldName: 'applicant_name' },
          profileKey: 'fullName',
        },
        {
          id: 'dob',
          label: 'D.O.B.',
          spokenLabel: 'What is your date of birth?',
          formatHint: 'Day, month, year — for example, 3 3 1954.',
          type: 'date',
          required: true,
          constraints: {},
          sensitivity: 'pii',
          confidence: 0.94,
          anchor: { kind: 'acroform', fieldName: 'dob' },
          profileKey: 'dateOfBirth',
        },
        {
          id: 'email',
          label: 'Email address (optional — for renewal reminders)',
          spokenLabel: 'What is your email address?',
          help: 'This is only used to remind you when books are due back. You can leave it blank.',
          type: 'email',
          required: false,
          constraints: {},
          sensitivity: 'pii',
          confidence: 0.97,
          anchor: { kind: 'acroform', fieldName: 'email' },
          profileKey: 'email',
        },
        {
          id: 'postcode',
          label: 'Postcode',
          spokenLabel: 'What is your postcode?',
          type: 'text',
          required: true,
          constraints: { maxLength: 8 },
          sensitivity: 'pii',
          confidence: 0.99,
          anchor: { kind: 'acroform', fieldName: 'postcode' },
          profileKey: 'postalCode',
        },
      ],
    },
    {
      id: 'membership',
      title: 'Your membership',
      fields: [
        {
          id: 'type',
          label: 'Membership category',
          spokenLabel: 'Which type of membership do you want?',
          type: 'choice',
          required: true,
          constraints: {
            options: [
              { value: 'adult', label: 'Adult (18+)', spokenLabel: 'Adult' },
              { value: 'child', label: 'Junior (under 18)', spokenLabel: 'Junior, for under eighteens' },
              { value: 'concession', label: 'Concessionary', spokenLabel: 'Concession, if you get certain benefits' },
            ],
          },
          sensitivity: 'none',
          confidence: 0.91,
          anchor: { kind: 'acroform', fieldName: 'member_type' },
        },
        {
          id: 'concession-evidence',
          label: 'If claiming concessionary rate, state benefit received',
          spokenLabel: 'Which benefit do you receive?',
          help: 'You only need to answer this because you chose the concession rate.',
          type: 'text',
          required: true,
          constraints: { maxLength: 60 },
          sensitivity: 'sensitive',
          confidence: 0.88,
          anchor: { kind: 'acroform', fieldName: 'benefit' },
          // Skip logic: never read aloud unless the concession rate was chosen.
          dependsOn: { fieldId: 'type', op: 'equals', value: 'concession' },
        },
        {
          id: 'formats',
          label: 'Please indicate any accessible formats required',
          spokenLabel: 'Do you need books in any accessible formats?',
          type: 'multichoice',
          required: false,
          constraints: {
            options: [
              { value: 'braille', label: 'Braille' },
              { value: 'largeprint', label: 'Large print' },
              { value: 'audio', label: 'Audiobook / DAISY' },
              { value: 'ebook', label: 'Accessible e-book' },
            ],
          },
          sensitivity: 'none',
          confidence: 0.93,
          anchor: { kind: 'acroform', fieldName: 'formats' },
        },
        {
          id: 'marketing',
          label: 'I do not wish to receive information about library events',
          // Note the inverted phrasing — the plain-language rewrite must NOT
          // drop the negation. See docs/ACCESSIBILITY.md §7.
          spokenLabel: 'Do you want to opt out of hearing about library events?',
          help: 'Ticking this box means you will NOT be sent information about events.',
          type: 'boolean',
          required: false,
          constraints: {},
          sensitivity: 'none',
          confidence: 0.52, // deliberately low — exercises the uncertainty path
          anchor: { kind: 'acroform', fieldName: 'no_marketing' },
        },
        {
          id: 'signature',
          label: "Applicant's signature",
          spokenLabel: 'Signature',
          help: 'This one needs a handwritten signature. I will tell you where it is on the page once the form is saved.',
          type: 'signature',
          required: false,
          constraints: {},
          sensitivity: 'pii',
          confidence: 0.96,
          anchor: { kind: 'region', page: 1, rect: { x: 72, y: 640, width: 220, height: 40 } },
        },
      ],
    },
  ],
};

export const fixtures = { libraryMembership };
