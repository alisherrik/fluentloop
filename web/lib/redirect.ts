export function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\%\x00-\x1f\x7f]/.test(value)) return '/';
  return value;
}
