export interface Curso {
  id?: string;
  nombre: string;
  descripcion: string;
  fechaInicio?: Date;           // ✅ Cambiado de Fecha_inicio
  fechaFin?: Date;              // ✅ Cambiado de Fecha_fin
  nomRepresentante: string;     // ✅ Cambiado de nom_representante
  numRepresentantes: string;    // ✅ CORREGIDO el typo
  personasIds?: string[];
  instructorIds?: string[];
  createdAt?: Date;
  createdBy?: string;
}