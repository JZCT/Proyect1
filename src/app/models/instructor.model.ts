export interface Instructor {
  id?: string;
  nombre: string;
  telefono: string;
  foto: string;
  cursosIds?: string[]; // Array de IDs de cursos asignados
  createdAt?: Date;
  createdBy?: string;
}