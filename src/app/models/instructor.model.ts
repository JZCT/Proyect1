// instructor.model.ts
export interface Instructor {
  id?: string;
  uid: string;           // ✅ Este campo existe
  nombre: string;
  telefono: string;      // ✅
  foto: string;
  asignado: boolean;
  cursoIds?: string[];    // ✅ Correcto (plural consistente)
  email?: string;         // ✅
  especialidad?: string;
  createdBy?: string;
  createdAt?: Date;
}