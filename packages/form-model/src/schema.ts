import { z } from 'zod';

/**
 * Runtime schema for the Form IR.
 *
 * This is a trust boundary: model output and extension-supplied DOM scrapes are
 * both untrusted. Anything that fails validation is downgraded (type 'unknown',
 * confidence 0) rather than discarded — a field we cannot classify still has to
 * be offered to the user, or we would silently drop a question from their form.
 */

export const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const anchorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('acroform'), fieldName: z.string().min(1) }),
  z.object({ kind: z.literal('region'), page: z.number().int().nonnegative(), rect: rectSchema }),
  z.object({ kind: z.literal('dom'), selector: z.string().min(1), frame: z.string().optional() }),
]);

export const fieldTypeSchema = z.enum([
  'text', 'longtext', 'number', 'currency', 'date', 'email', 'phone',
  'name', 'address', 'choice', 'multichoice', 'boolean', 'signature', 'unknown',
]);

export const sensitivitySchema = z.enum(['none', 'pii', 'sensitive']);

export const profileKeySchema = z.enum([
  'givenName', 'familyName', 'fullName', 'dateOfBirth', 'email', 'phone',
  'addressLine1', 'addressLine2', 'city', 'postalCode', 'country', 'nationalId',
]);

export const choiceSchema = z.object({
  value: z.string(),
  label: z.string(),
  spokenLabel: z.string().optional(),
});

export const constraintsSchema = z.object({
  maxLength: z.number().int().positive().optional(),
  pattern: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  options: z.array(choiceSchema).optional(),
});

export const conditionSchema = z.object({
  fieldId: z.string(),
  op: z.enum(['equals', 'notEquals', 'isAnswered', 'isEmpty']),
  value: z.string().optional(),
});

export const fieldSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  spokenLabel: z.string(),
  help: z.string().optional(),
  formatHint: z.string().optional(),
  type: fieldTypeSchema,
  required: z.boolean(),
  constraints: constraintsSchema.default({}),
  sensitivity: sensitivitySchema,
  confidence: z.number().min(0).max(1),
  anchor: anchorSchema,
  dependsOn: conditionSchema.optional(),
  profileKey: profileKeySchema.optional(),
});

export const sectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  fields: z.array(fieldSchema),
});

export const formSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  source: z.enum(['pdf', 'image', 'dom']),
  locale: z.string(),
  provenance: z.object({
    capturedAt: z.string(),
    pageCount: z.number().int().nonnegative(),
    extractor: z.string(),
    modelVersion: z.string().optional(),
    localOnly: z.boolean(),
  }),
  sections: z.array(sectionSchema),
});

export type ParsedForm = z.infer<typeof formSchema>;

export interface ParseResult {
  form: ParsedForm | null;
  issues: string[];
}

/**
 * Parse untrusted IR. Never throws — callers are in the middle of a spoken
 * interaction and need a degraded result they can talk about, not an exception.
 */
export function parseForm(input: unknown): ParseResult {
  const result = formSchema.safeParse(input);
  if (result.success) return { form: result.data, issues: [] };
  return {
    form: null,
    issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}
