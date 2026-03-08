export interface User {
  id?: string;
  nombre: string;
  email: string;
  password: string;
  role: string;
  companyTag?: string;
  instructorId?: string;
  uid?: string;
  assignedCourseIds?: string[];
  createdAt?: Date;
}
