export interface PersonaArchivo {
  nombre: string;
  url: string;
  tipo: string;
  uploadedAt?: Date;
  size?: number;
  storagePath?: string;
  file?: File;
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
  assignedCursoId?: string;
  assignmentStatus?: 'available' | 'assigned';
  searchTokens?: string[];
  locationTokens?: string[];
  locationCity?: string;
  locationState?: string;
  anioPersona?: number;
  mesPersona?: number;
  lastCursoYear?: number;
  lastCursoMonth?: number;
  createdAt?: Date;
}
