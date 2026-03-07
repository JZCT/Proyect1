// Interfaz que define la estructura de un Curso
export interface Curso {
  id?: number;                    // ID único del curso
  nombre: string;                 // Nombre del curso
  descripcion: string;            // Descripción de qué trata el curso
  Fecha_inicio: undefined;            // Fecha de inicio del curso
  Fecha_fin: undefined;               // Fecha de fin del curso
  nom_representante: string;       // Nombre del representante asignado al curso
  num_represnetantes: string;     // Número de representantes asignados al curso
  estado?: boolean;               // Si está activo o inactivo
  personasIds?: number[];         // Array de IDs de personas asignadas a este curso
}
