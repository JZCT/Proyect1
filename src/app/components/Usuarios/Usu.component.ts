import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usu.component.html',
  styleUrl: './Usu.component.scss'
})
export class UsersComponent implements OnInit {
  users: User[] = [];
  isAdmin: boolean = false;

  newUser: User = {
    nombre: '',
    email: '',
    role: 'company'
  };

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.checkAdminStatus();
    this.loadUsers();
  }

  private checkAdminStatus() {
    this.authService.isAdmin().subscribe({
      next: (adminStatus) => {
        this.isAdmin = adminStatus;
        console.log('¿Es admin?', adminStatus);
      },
      error: (error) => {
        console.error('Error verificando admin:', error);
        this.isAdmin = false;
      }
    });
  }

  private loadUsers() {
    this.authService.getAllUsers().subscribe({
      next: (users) => {
        this.users = users;
        console.log('Usuarios cargados:', users);
      },
      error: (error) => {
        console.error('Error cargando usuarios:', error);
      }
    });
  }

  async addUser() {
    if (!this.newUser.nombre || !this.newUser.email) {
      alert('Por favor completa todos los campos');
      return;
    }

    try {
      await this.authService.addUser({ ...this.newUser });
      alert('Usuario agregado exitosamente');
      this.newUser = { nombre: '', email: '', role: 'company' };
      // No necesitas recargar, el observable se actualiza solo
    } catch (error: any) {
      console.error('Error al agregar usuario:', error);
      alert('Error al agregar usuario: ' + (error.message || 'Error desconocido'));
    }
  }

  async deleteUser(id?: string) {
    if (!id) return;
    
    if (confirm('¿Estás seguro de eliminar este usuario?')) {
      try {
        await this.authService.deleteUser(id);
        alert('Usuario eliminado exitosamente');
        // No necesitas recargar, el observable se actualiza solo
      } catch (error: any) {
        console.error('Error al eliminar usuario:', error);
        alert('Error al eliminar usuario: ' + (error.message || 'Error desconocido'));
      }
    }
  }
}