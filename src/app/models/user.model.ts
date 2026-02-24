export type UserRole = 'admin' | 'instructor' | 'company';

export interface User {
  id?: number;
  nombre: string;
  email: string;
  role: UserRole;
  assignedCourseIds?: number[];
}