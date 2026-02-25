export interface Persona {
  id?: number;
  nombre: string;
  email: string;
  telefono: string;
  empresa: string;
  foto: string;
  archivos?: string[]; // Nueva propiedad
  estado: boolean; // Nueva propiedad para estado activo/inactivo
}