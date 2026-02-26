export interface Persona {
  id?: string; // Asegúrate que sea string
  nombre: string;
  email: string;
  telefono?: string;
  empresa?: string;
  foto?: string;
  archivos?: Array<{
    nombre: string;
    url: string;
    tipo: string;
  }>;
  cursoIds?: string[]; // Array de strings
  createdAt?: Date;
}