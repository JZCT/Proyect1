export function normalizeDateInput(value: unknown, fallback?: Date): Date | undefined {
  const parsed = coerceDate(value);
  if (parsed) {
    return parsed;
  }

  return fallback;
}

export function coerceDate(value: unknown): Date | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  if (typeof value === 'object' && value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    try {
      const parsed = (value as { toDate: () => Date }).toDate();
      return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}
