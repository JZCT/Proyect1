export function sanitizeDigitsInput(value: unknown, maxLength?: number): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return typeof maxLength === 'number' ? digits.slice(0, maxLength) : digits;
}

export function sanitizePhoneInput(value: unknown, maxLength = 10): string {
  return sanitizeDigitsInput(value, maxLength);
}

export function sanitizeDecimalInput(value: unknown, maxDecimals = 1): string {
  const normalized = String(value ?? '').replace(/,/g, '.');
  const cleaned = normalized.replace(/[^\d.]/g, '');
  const [integerPart = '', ...decimalParts] = cleaned.split('.');
  const integerDigits = integerPart.replace(/\D/g, '');
  const decimalDigits = decimalParts.join('').replace(/\D/g, '').slice(0, maxDecimals);

  if (!integerDigits && !decimalDigits) return '';
  if (!integerDigits && decimalDigits) return `0.${decimalDigits}`;
  return decimalDigits ? `${integerDigits}.${decimalDigits}` : integerDigits;
}

export function sanitizeScoreInput(value: unknown): number | null {
  const sanitized = sanitizeDecimalInput(value, 1);
  if (!sanitized) return null;

  const numericValue = Number(sanitized);
  if (Number.isNaN(numericValue)) return null;

  const bounded = Math.max(0, Math.min(100, numericValue));
  return Math.round(bounded * 10) / 10;
}
