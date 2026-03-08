export interface Curso {
  idcurso?: string;
  nombre: string;
  descripcion: string;
  Fecha_inicio?: Date;
  Fecha_fin?: Date;
  nom_representante: string;
  num_represnetantes: string;
  companyTag?: string;
  personasIds?: string[];
  instructorIds?: string[];
  createdAt?: Date;
  createdBy?: string;
}
