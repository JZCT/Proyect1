export interface PersonaArchivo {
  nombre: string;
  url: string;
  tipo: string;
  uploadedAt?: Date;
  size?: number;
}

export interface Persona {
  id?: string;
  nombre: string;
  curp: string;
  email: string;
  telefono?: string;
  empresa?: string;
  companyTag?: string;
  lugar?: string;
  foto?: string;
  clfPractica?: number;
  clfTeorica?: number;
  archivos?: PersonaArchivo[];
  cursoIds?: string[];
  createdAt?: Date;
}
