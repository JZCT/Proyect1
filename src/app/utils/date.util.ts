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
    if (typeof value === 'string') {
      const normalized = value.trim();
      const dateOnlyMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateOnlyMatch) {
        const year = Number(dateOnlyMatch[1]);
        const month = Number(dateOnlyMatch[2]);
        const day = Number(dateOnlyMatch[3]);
        const parsedLocal = new Date(year, month - 1, day, 12, 0, 0, 0);
        return Number.isNaN(parsedLocal.getTime()) ? undefined : parsedLocal;
      }
    }

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
