export interface Persona {
  id?: string;
  nombre: string;
  curp: string;
  email: string;
  telefono?: string;
  empresa?: string;
  lugar?: string;
  foto?: string;
  clfPractica?: number;
  clfTeorica?: number;
  archivos?: Array<{
    nombre: string;
    url: string;
    tipo: string;
  }>;
  cursoIds?: string[];
  createdAt?: Date;
}
