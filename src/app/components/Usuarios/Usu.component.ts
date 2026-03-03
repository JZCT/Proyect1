import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
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
  
  roles: string[] = ['admin', 'instructor', 'company'];

  newUser: Partial<User> = {
    nombre: '',
    email: '',
    role: 'admin'
  };

  lastCreatedPassword: string | null = null;
  showPassword: { [key: string]: boolean } = {};

  constructor(
    public authService: AuthService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.checkAdminStatus();
    this.loadUsers();
  }

  private checkAdminStatus() {
    this.authService.isAdmin().subscribe({
      next: (adminStatus) => {
        this.isAdmin = adminStatus;
      },
      error: (error) => {
        console.error('Error verificando admin:', error);
        this.isAdmin = false;
        this.notificationService.showError('Error al verificar permisos de administrador');
      }
    });
  }

  private loadUsers() {
    this.authService.getAllUsers().subscribe({
      next: (users) => {
        this.users = users;
      },
      error: (error) => {
        console.error('Error cargando usuarios:', error);
        this.notificationService.showError('Error al cargar los usuarios');
      }
    });
  }

  async addUser() {
    if (!this.newUser.nombre || !this.newUser.email) {
      this.notificationService.showWarning('Por favor completa todos los campos');
      return;
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.newUser.email)) {
      this.notificationService.showWarning('Ingresa un email válido');
      return;
    }

    try {
      const result = await this.authService.addUser(this.newUser as User);
      
      if (result.success && result.password) {
        this.lastCreatedPassword = result.password;
        this.notificationService.showSuccess('✅ Usuario agregado exitosamente');
        
        // Limpiar formulario
        this.newUser = { nombre: '', email: '', role: 'company' };
        
        // Recargar lista
        this.loadUsers();
        
        // Auto-ocultar contraseña después de 30 segundos
        setTimeout(() => {
          this.lastCreatedPassword = null;
        }, 30000);
      } else {
        this.notificationService.showError('Error al crear usuario');
      }
    } catch (error: any) {
      console.error('Error al agregar usuario:', error);
      this.notificationService.showError('❌ Error al agregar usuario: ' + (error.message || 'Error desconocido'));
    }
  }

  async deleteUser(id?: string) {
    if (!id) return;
    
    if (confirm('¿Estás seguro de eliminar este usuario?')) {
      try {
        await this.authService.deleteUser(id);
        this.notificationService.showSuccess('✅ Usuario eliminado exitosamente');
        this.loadUsers();
      } catch (error: any) {
        console.error('Error al eliminar usuario:', error);
        this.notificationService.showError('❌ Error al eliminar usuario');
      }
    }
  }

  // 👇 NUEVOS MÉTODOS
  togglePassword(userId: string) {
    this.showPassword[userId] = !this.showPassword[userId];
  }

  copyPassword(password: string) {
    navigator.clipboard.writeText(password).then(() => {
      this.notificationService.showSuccess('✅ Contraseña copiada al portapapeles');
    }).catch(() => {
      this.notificationService.showError('❌ Error al copiar');
    });
  }

  async regeneratePassword(userId: string, email: string) {
    if (confirm(`¿Regenerar contraseña para ${email}?`)) {
      try {
        const result = await this.authService.regeneratePassword(userId);
        
        if (result.success && result.newPassword) {
          this.notificationService.showSuccess('✅ Contraseña regenerada exitosamente');
          // Mostrar la nueva contraseña
          this.lastCreatedPassword = result.newPassword;
          // Recargar usuarios para ver el cambio
          this.loadUsers();
          
          // Auto-ocultar después de 30 segundos
          setTimeout(() => {
            this.lastCreatedPassword = null;
          }, 30000);
        } else {
          this.notificationService.showError('Error al regenerar contraseña');
        }
      } catch (error) {
        console.error('Error regenerando contraseña:', error);
        this.notificationService.showError('Error al regenerar contraseña');
      }
    }
  }

  logout() {
    this.authService.logout();
    this.notificationService.showInfo('Sesión cerrada');
  }
}