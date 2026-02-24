// Interfaz que define la estructura de un Grupo
export interface Grupo {
  id?: number;                    // ID único del grupo
  nombre: string;                 // Nombre del grupo (ej: "Grupo A")
  descripcion: string;            // Descripción del grupo
  // DEPRECATED: Grupo model kept for compatibility. Use Curso.personasIds instead.
    cursoId?: number;
    personas?: number[];
    estado?: boolean;
  }
