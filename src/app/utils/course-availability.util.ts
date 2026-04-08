import { Curso } from '../models/curso.model';
import { COURSE_ASSIGNMENT_GRACE_MONTHS } from '../config/global.constants';
import { coerceDate } from './date.util';

export function isCursoCaducadoParaAsignacion(
  curso: Partial<Curso>,
  graceMonths = COURSE_ASSIGNMENT_GRACE_MONTHS,
  now: Date = new Date()
): boolean {
  const baseDate = resolveCursoCaducidadBaseDate(curso);
  if (!baseDate) {
    return false;
  }

  const normalizedGraceMonths = Number.isFinite(graceMonths)
    ? Math.max(0, Math.floor(graceMonths))
    : 0;

  const expiryDate = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    23,
    59,
    59,
    999
  );

  if (normalizedGraceMonths > 0) {
    expiryDate.setMonth(expiryDate.getMonth() + normalizedGraceMonths);
  }

  return expiryDate.getTime() < now.getTime();
}

function resolveCursoCaducidadBaseDate(curso: Partial<Curso>): Date | null {
  const fechaFin = coerceDate(curso.Fecha_fin);
  if (fechaFin) {
    return fechaFin;
  }

  const fechaInicio = coerceDate(curso.Fecha_inicio);
  if (fechaInicio) {
    return fechaInicio;
  }

  if (curso.anioCurso && curso.mesCurso) {
    return new Date(curso.anioCurso, curso.mesCurso, 0, 23, 59, 59, 999);
  }

  return null;
}
