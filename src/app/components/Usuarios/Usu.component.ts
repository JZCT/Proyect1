import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { InstructorService } from '../../services/instructor.service';
import { NotificationService } from '../../services/notification.service';
import { QueryDocumentSnapshot, DocumentData } from '@angular/fire/firestore';
import { User } from '../../models/user.model';
import { Instructor } from '../../models/instructor.model';

type FilteredUsersCache = {
  source: User[];
  instructoresSource: Instructor[];
  term: string;
  result: User[];
};

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usu.component.html',
  styleUrl: './Usu.component.scss'
})
export class UsersComponent implements OnInit {
  users: User[] = [];
  instructores: Instructor[] = [];
  isAdmin: boolean = false;
  currentUser: User | null = null;
  loading: boolean = false;
  loadingUsers: boolean = false;
  searchTerm: string = '';
  editingCompanyTagUserId: string | null = null;
  editingCompanyTagValue: string = '';
  savingCompanyTagUserId: string | null = null;
  deletingUserId: string | null = null;
  pageSize = 20;
  lastUserSnapshot: QueryDocumentSnapshot<DocumentData> | null = null;
  hasMoreUsers = true;
  private instructorNameById: Record<string, string> = {};
  private filteredUsersCache: FilteredUsersCache | null = null;

  newUser: Partial<User> = {
    nombre: '',
    email: '',
    password: '',
    role: '',
    companyTag: '',
    instructorId: ''
  };

  // Roles disponibles
  roles = [
    { value: 'admin', label: 'Administrador' },
    { value: 'instructor', label: 'Instructor' },
    { value: 'company', label: 'Empresa' }
  ];

  constructor(
    private authService: AuthService,
    private instructorService: InstructorService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.checkAdminStatus();
    this.getCurrentUser();
    this.loadUsers(true);
    this.loadInstructores();
  }

  private checkAdminStatus() {
    this.authService.isAdmin().subscribe({
      next: (adminStatus) => {
        this.isAdmin = adminStatus;
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
      }
    });
  }

  private async loadUsers(reset = false) {
    if (reset) {
      this.users = [];
      this.lastUserSnapshot = null;
      this.hasMoreUsers = true;
      this.filteredUsersCache = null;
    }

    if (!this.hasMoreUsers || this.loadingUsers) {
      return;
    }

    this.loadingUsers = true;

    try {
      const result = await this.authService.getUsersPage(this.pageSize, this.lastUserSnapshot ?? undefined);
      this.users = [...this.users, ...result.users];
      this.lastUserSnapshot = result.lastDoc;
      this.hasMoreUsers = result.hasMore;
      this.filteredUsersCache = null;
      console.log('Usuarios cargados:', this.users);
    } catch (error) {
      console.error('Error cargando usuarios:', error);
      this.hasMoreUsers = false;
    } finally {
      this.loadingUsers = false;
    }
  }

  loadMoreUsers() {
    this.loadUsers(false);
  }

  private loadInstructores() {
    this.instructorService.getInstructores().subscribe({
      next: (instructores) => {
        this.instructores = instructores;
        this.rebuildInstructorNameIndex();
        this.filteredUsersCache = null;
      },
      error: (error) => {
        console.error('Error cargando instructores:', error);
      }
    });
  }

  async addUser() {
    // Validaciones
    if (!this.newUser.nombre || !this.newUser.nombre.trim()) {
      this.notificationService.warning('Por favor ingresa el nombre completo');
      return;
    }

    if (!this.newUser.email || !this.newUser.email.trim()) {
      this.notificationService.warning('Por favor ingresa un email valido');
      return;
    }

    if (!this.newUser.password || this.newUser.password.length < 6) {
      this.notificationService.warning('La contrasena debe tener al menos 6 caracteres');
      return;
    }

    if (!this.newUser.role || !this.newUser.role.trim()) {
      this.notificationService.warning('Por favor selecciona un rol');
      return;
    }

    if (this.newUser.role === 'instructor' && !this.newUser.instructorId) {
      this.notificationService.warning('Selecciona el perfil de instructor para este usuario');
      return;
    }

    // Validar que el rol sea uno de los permitidos
    const rolesValidos = ['admin', 'instructor', 'company'];
    if (!rolesValidos.includes(this.newUser.role)) {
      this.notificationService.warning('Rol invalido seleccionado');
      return;
    }

    // Solo admin puede crear otros usuarios
    if (!this.isAdmin) {
      this.notificationService.warning('Solo los administradores pueden crear usuarios');
      return;
    }

    try {
      this.loading = true;
      if (this.newUser.role === 'company') {
        this.newUser.companyTag = this.normalizeCompanyTag(this.newUser.companyTag);
      } else {
        this.newUser.companyTag = '';
      }

      if (this.newUser.role !== 'instructor') {
        this.newUser.instructorId = '';
        this.newUser.assignedCourseIds = [];
      } else {
        const instructor = this.instructores.find((item) => item.id === this.newUser.instructorId);
        this.newUser.assignedCourseIds = [...(instructor?.cursosIds || [])];
      }

      await this.authService.addUser(this.newUser as User);
      this.notificationService.success('Usuario agregado exitosamente');
      this.resetForm();
      await this.loadUsers(true);
    } catch (error: any) {
      console.error('Error al agregar usuario:', error);
      this.notificationService.error('Error al agregar usuario: ' + (error.message || 'Error desconocido'));
    } finally {
      this.loading = false;
    }
  }

  async deleteUser(id?: string) {
    if (!id) return;

    // Solo admin puede eliminar usuarios
    if (!this.isAdmin) {
      this.notificationService.warning('Solo los administradores pueden eliminar usuarios');
      return;
    }

    const usuario = this.users.find(u => u.id === id);
    if (confirm(`¿Estás seguro de eliminar a ${usuario?.nombre}?`)) {
      try {
        this.loading = true;
        this.deletingUserId = id;
        await this.authService.deleteUser(id);
        this.users = this.users.filter((user) => user.id !== id);
        this.notificationService.success('Usuario eliminado exitosamente');
      } catch (error: any) {
        console.error('Error al eliminar usuario:', error);
        this.notificationService.error('Error al eliminar usuario: ' + (error.message || 'Error desconocido'));
      } finally {
        this.deletingUserId = null;
        this.loading = false;
      }
    }
  }

  startCompanyTagEdit(user: User) {
    if (!this.isAdmin || user.role !== 'company' || !user.id) return;

    this.editingCompanyTagUserId = user.id;
    this.editingCompanyTagValue = user.companyTag || '';
  }

  cancelCompanyTagEdit() {
    this.editingCompanyTagUserId = null;
    this.editingCompanyTagValue = '';
  }

  getAutoCompanyTagPreviewForUser(user: User): string {
    if (!user.nombre && !user.email) return 'empresa';
    return this.normalizeCompanyTag(user.nombre || user.email.split('@')[0] || '') || 'empresa';
  }

  async saveCompanyTag(user: User) {
    if (!this.isAdmin || user.role !== 'company' || !user.id) return;

    try {
      this.savingCompanyTagUserId = user.id;
      await this.authService.updateUserCompanyTag(user.id, {
        nombre: user.nombre,
        email: user.email,
        role: user.role,
        companyTag: this.editingCompanyTagValue
      });
      this.notificationService.success('Etiqueta de empresa actualizada correctamente');
      this.cancelCompanyTagEdit();
    } catch (error: any) {
      console.error('Error actualizando etiqueta de empresa:', error);
      this.notificationService.error('Error al actualizar la etiqueta: ' + (error.message || 'Error desconocido'));
    } finally {
      this.savingCompanyTagUserId = null;
    }
  }

  private resetForm() {
    this.newUser = {
      nombre: '',
      email: '',
      password: '',
      role: '',
      companyTag: '',
      instructorId: ''
    };
  }

  onRoleChange() {
    if (this.newUser.role !== 'company') {
      this.newUser.companyTag = '';
    }

    if (this.newUser.role !== 'instructor') {
      this.newUser.instructorId = '';
      this.newUser.assignedCourseIds = [];
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

  getInstructorNameById(instructorId?: string): string {
    if (!instructorId) return 'Sin vincular';
    return this.instructorNameById[instructorId] || 'Sin vincular';
  }

  get filteredUsers(): User[] {
    const term = this.normalizeSearch(this.searchTerm);
    if (
      this.filteredUsersCache &&
      this.filteredUsersCache.source === this.users &&
      this.filteredUsersCache.instructoresSource === this.instructores &&
      this.filteredUsersCache.term === term
    ) {
      return this.filteredUsersCache.result;
    }

    if (!term) {
      this.filteredUsersCache = {
        source: this.users,
        instructoresSource: this.instructores,
        term,
        result: this.users
      };
      return this.users;
    }

    const result = this.users.filter((user) => {
      const target = this.normalizeText([
        user.nombre,
        user.email,
        user.role,
        user.companyTag || '',
        this.getInstructorNameById(user.instructorId)
      ]
        .join(' '));

      return target.includes(term);
    });

    this.filteredUsersCache = {
      source: this.users,
      instructoresSource: this.instructores,
      term,
      result
    };

    return result;
  }

  trackByUserId(index: number, user: User): string {
    return user.id || user.email || user.nombre || `${index}`;
  }

  trackByInstructorId(index: number, instructor: Instructor): string {
    return instructor.id || instructor.nombre || `${index}`;
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

  private rebuildInstructorNameIndex(): void {
    const index: Record<string, string> = {};
    for (const instructor of this.instructores) {
      const id = (instructor.id || '').trim();
      if (!id) continue;
      index[id] = instructor.nombre || '';
    }
    this.instructorNameById = index;
  }
}
