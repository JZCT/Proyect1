export interface CursoArchivo {
  nombre: string;
  url: string;
  tipo: string;
  uploadedAt?: Date;
  size?: number;
  storagePath?: string;
  file?: File;
}

export interface Curso {
  idcurso?: string;
  nombre: string;
  descripcion: string;
  anioCurso?: number;
  mesCurso?: number;
  dia?: Date;
  // Legacy fields kept for backward compatibility with old stored documents.
  Fecha_inicio?: Date;
  Fecha_fin?: Date;
  nom_representante: string;
  num_represnetantes: string;
  companyTag?: string;
  personasIds?: string[];
  instructorIds?: string[];
  archivos?: CursoArchivo[];
  createdAt?: Date;
  createdBy?: string;
}
