export interface Curso {
  id?: string; // Asegúrate que sea string
  nombre: string;
  descripcion: string;
  Fecha_inicio?: Date;
  Fecha_fin?: Date;
  nom_representante: string;
  num_represnetantes: string;
  personasIds?: string[]; // Array de strings
  createdAt?: Date;
  createdBy?: string;
}