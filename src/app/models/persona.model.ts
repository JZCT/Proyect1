// Interfaz que define la estructura de una Persona
export interface Persona {
  id?: number;           // ID único (opcional al crear, se genera después)
  nombre: string;        // Nombre completo de la persona
  email: string;         // Email para contacto
  telefono: string;      // Teléfono para contacto
  estado?: boolean;      // Indica si está activa o inactiva
}
