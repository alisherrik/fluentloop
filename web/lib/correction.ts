export type Correction = { original: string; corrected: string; explanation: string };
export function validateCorrection(value: unknown): Correction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const keys = ['original', 'corrected', 'explanation'];
  if (Object.keys(input).length !== 3 || keys.some((key) => typeof input[key] !== 'string')) return null;
  const fields = keys.map((key) => (input[key] as string).trim());
  if (fields.some((field) => !field || field.length > 2000)) return null;
  return { original: fields[0], corrected: fields[1], explanation: fields[2] };
}
export function sameCorrection(expected: Correction, stored: unknown): boolean {
  if (!stored || typeof stored !== 'object') return false;
  const value = stored as Record<string, unknown>;
  return value.original === expected.original && value.corrected === expected.corrected && value.explanation === expected.explanation;
}
