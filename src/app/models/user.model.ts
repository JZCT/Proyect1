// src/app/models/user.model.ts
export interface User {
  id?: string;
  nombre: string;
  email: string;
  role: 'admin' | 'instructor' | 'company';
  uid: string;
  assignedCourseIds?: string[];
  createdAt?: Date;
  // 👇 NUEVOS CAMPOS
  tempPassword?: string;      // Contraseña temporal (solo para usuarios de prueba)
  isTestUser?: boolean;       // Marcar si es usuario de prueba
  lastPasswordReset?: Date;   // Último cambio de contraseña
}