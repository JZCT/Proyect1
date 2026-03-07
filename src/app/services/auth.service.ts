import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { User } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {

  // Usuarios simulados
  private users: User[] = [
    { id: 1, nombre: 'Admin Global', email: 'admin@site.com', role: 'admin' },
    { id: 2, nombre: 'Instructor A', email: 'instrA@site.com', role: 'instructor', assignedCourseIds: [1] },
    { id: 3, nombre: 'Empresa X', email: 'empresa@site.com', role: 'company', assignedCourseIds: [2] }
  ];

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor() {}

  // ======================
  // AUTH
  // ======================

  loginByEmail(email: string): User | null {
    const user = this.users.find(u => u.email === email) || null;
    this.currentUserSubject.next(user);
    return user;
  }

  logout() {
    this.currentUserSubject.next(null);
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.getValue();
  }

  isAdmin(): boolean {
    return this.getCurrentUser()?.role === 'admin';
  }

  // ======================
  // USERS CRUD
  // ======================

  getAllUsers(): User[] {
    return [...this.users];
  }

  addUser(user: User) {
    user.id = Date.now();
    this.users.push(user);
  }

  deleteUser(id: number) {
    this.users = this.users.filter(u => u.id !== id);

    const current = this.getCurrentUser();
    if (current?.id === id) {
      this.logout();
    }
  }

  updateUser(updatedUser: User) {
    const index = this.users.findIndex(u => u.id === updatedUser.id);
    if (index !== -1) {
      this.users[index] = updatedUser;
    }
  }
}