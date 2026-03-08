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
  currentUser: User | null = null;
  loading: boolean = false;
  searchTerm: string = '';

  newUser: Partial<User> = {
    nombre: '',
    email: '',
    password: '',
    role: '',
    companyTag: ''
  };

  // Roles disponibles
  roles = [
    { value: 'admin', label: 'Administrador' },
    { value: 'instructor', label: 'Instructor' },
    { value: 'company', label: 'Empresa' }
  ];

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.checkAdminStatus();
    this.getCurrentUser();
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

  private getCurrentUser() {
    this.authService.currentUser$.subscribe(async (firebaseUser) => {
      if (firebaseUser) {
        const userData = await this.authService.getUserData(firebaseUser.uid);
        this.currentUser = userData;
        console.log('Usuario actual:', this.currentUser);
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
    // Validaciones
    if (!this.newUser.nombre || !this.newUser.nombre.trim()) {
      alert('Por favor ingresa el nombre completo');
      return;
    }

    if (!this.newUser.email || !this.newUser.email.trim()) {
      alert('Por favor ingresa un email válido');
      return;
    }

    if (!this.newUser.password || this.newUser.password.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (!this.newUser.role || !this.newUser.role.trim()) {
      alert('Por favor selecciona un rol');
      return;
    }

    // Validar que el rol sea uno de los permitidos
    const rolesValidos = ['admin', 'instructor', 'company'];
    if (!rolesValidos.includes(this.newUser.role)) {
      alert('Rol inválido seleccionado');
      return;
    }

    // Solo admin puede crear otros usuarios
    if (!this.isAdmin) {
      alert('Solo los administradores pueden crear usuarios');
      return;
    }

    try {
      this.loading = true;
      if (this.newUser.role === 'company') {
        this.newUser.companyTag = this.normalizeCompanyTag(this.newUser.companyTag);
      } else {
        this.newUser.companyTag = '';
      }
      await this.authService.addUser(this.newUser as User);
      alert('✅ Usuario agregado exitosamente');
      this.resetForm();
    } catch (error: any) {
      console.error('Error al agregar usuario:', error);
      alert('❌ Error al agregar usuario: ' + (error.message || 'Error desconocido'));
    } finally {
      this.loading = false;
    }
  }

  async deleteUser(id?: string) {
    if (!id) return;

    // Solo admin puede eliminar usuarios
    if (!this.isAdmin) {
      alert('Solo los administradores pueden eliminar usuarios');
      return;
    }

    const usuario = this.users.find(u => u.id === id);
    if (confirm(`¿Estás seguro de eliminar a ${usuario?.nombre}?`)) {
      try {
        this.loading = true;
        await this.authService.deleteUser(id);
        alert('✅ Usuario eliminado exitosamente');
      } catch (error: any) {
        console.error('Error al eliminar usuario:', error);
        alert('❌ Error al eliminar usuario: ' + (error.message || 'Error desconocido'));
      } finally {
        this.loading = false;
      }
    }
  }

  private resetForm() {
    this.newUser = {
      nombre: '',
      email: '',
      password: '',
      role: '',
      companyTag: ''
    };
  }

  onRoleChange() {
    if (this.newUser.role !== 'company') {
      this.newUser.companyTag = '';
    }
  }

  get autoCompanyTagPreview(): string {
    if (!this.newUser.nombre) return 'empresa';
    return this.normalizeCompanyTag(this.newUser.nombre);
  }

  private normalizeCompanyTag(tag?: string): string {
    return (tag || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .trim();
  }

  getRoleLabel(roleValue: string): string {
    const role = this.roles.find(r => r.value === roleValue);
    return role ? role.label : roleValue;
  }

  get filteredUsers(): User[] {
    const term = this.normalizeSearch(this.searchTerm);
    if (!term) return this.users;

    return this.users.filter((user) => {
      const target = this.normalizeText([
        user.nombre,
        user.email,
        user.role,
        user.companyTag || ''
      ]
        .join(' '));

      return target.includes(term);
    });
  }

  private normalizeSearch(value?: string): string {
    return this.normalizeText(value || '').trim();
  }

  private normalizeText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }
}
