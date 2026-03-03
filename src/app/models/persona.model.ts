export interface Persona {
  id?: string;
  nombre: string;
  email: string;
  telefono?: string;
  empresa?: string;
  ciudad?: string;  // NUEVO CAMPO
  foto?: string;
  archivos?: Array<{
    nombre: string;
    url: string;
    tipo: string;
  }>;
  cursoIds?: string[]; // Cursos a los que está asignada
  createdAt?: Date;
  updatedAt?: Date;
}