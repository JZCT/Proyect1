export interface User {
  id?: string; // Asegúrate que sea string
  nombre: string;
  email: string;
  role: 'admin' | 'instructor' | 'company';
  uid?: string;
  assignedCourseIds?: string[]; // Array de strings
  createdAt?: Date;
}