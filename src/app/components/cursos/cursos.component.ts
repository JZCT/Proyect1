import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CursoService } from '../../services/curso.service';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { Curso } from '../../models/curso.model';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-cursos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cursos.component.html',
  styleUrl: './cursos.component.scss'
})
export class CursosComponent implements OnInit {
  cursos: Curso[] = [];
  showForm = false;
  editingId: string | null = null;
  
  currentUser: User | null = null;
  isAdmin = false;
  isInstructor = false;
  isCompany = false;

  newCurso: Partial<Curso> = {
    nombre: '',
    descripcion: '',
    fechaInicio: undefined,
    fechaFin: undefined,
    nomRepresentante: '',
    numRepresentantes: '',
    instructorIds: [],
    personasIds: []
  };

  editingCurso: Partial<Curso> = {
    nombre: '',
    descripcion: '',
    fechaInicio: undefined,
    fechaFin: undefined,
    nomRepresentante: '',
    numRepresentantes: '',
    instructorIds: [],
    personasIds: []
  };

  constructor(
    private cursoService: CursoService,
    private authService: AuthService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.loadCurrentUser();
    this.loadCursos();
  }

  private loadCurrentUser() {
    this.authService.currentUser$.subscribe(async (firebaseUser) => {
      if (firebaseUser) {
        const userData = await this.authService.getUserData(firebaseUser.uid);
        this.currentUser = userData;
        this.isAdmin = userData?.role === 'admin';
        this.isInstructor = userData?.role === 'instructor';
        this.isCompany = userData?.role === 'company';
      }
    });
  }

  // ========== MÉTODOS DE PERMISOS ==========
  canCreateCurso(): boolean {
    return this.isAdmin;
  }

  canEditCurso(): boolean {
    return this.isAdmin;
  }

  canDeleteCurso(): boolean {
    return this.isAdmin;
  }

  canViewCurso(): boolean {
    return true;
  }

  loadCursos() {
    this.cursoService.getCursos().subscribe({
      next: (cursos) => {
        this.cursos = cursos;
        console.log('Cursos cargados:', cursos);
      },
      error: (error) => {
        console.error('Error cargando cursos:', error);
        this.notificationService.showError('Error al cargar los cursos');
      }
    });
  }

  toggleForm() {
    if (!this.canCreateCurso()) {
      this.notificationService.showError('No tienes permisos para realizar esta acción');
      return;
    }
    this.showForm = !this.showForm;
    if (!this.showForm) {
      this.resetForm();
    }
  }

  async addCurso() {
    if (!this.canCreateCurso()) return;

    if (
      !this.newCurso.nombre || 
      !this.newCurso.descripcion || 
      !this.newCurso.fechaInicio || 
      !this.newCurso.fechaFin || 
      !this.newCurso.nomRepresentante || 
      !this.newCurso.numRepresentantes
    ) {
      this.notificationService.showWarning('Por favor completa todos los campos');
      return;
    }

    try {
      await this.cursoService.addCurso({
        ...this.newCurso as Curso,
        personasIds: [],
        instructorIds: []
      });
      this.resetForm();
      this.showForm = false;
      this.notificationService.showSuccess('✅ Curso agregado exitosamente');
      this.loadCursos();
    } catch (error) {
      console.error('Error agregando curso:', error);
      this.notificationService.showError('❌ Error al agregar curso');
    }
  }

  startEdit(curso: Curso) {
    if (!this.canEditCurso()) {
      this.notificationService.showError('No tienes permisos para editar cursos');
      return;
    }

    this.editingId = curso.id || null;
    this.editingCurso = { ...curso };
    this.showForm = true;
  }

  async updateCurso() {
    if (!this.canEditCurso() || !this.editingId) {
      this.notificationService.showError('No tienes permisos para editar cursos');
      return;
    }

    try {
      await this.cursoService.updateCurso(this.editingId, this.editingCurso as Curso);
      this.resetForm();
      this.notificationService.showSuccess('✅ Curso actualizado exitosamente');
      this.loadCursos();
    } catch (error) {
      console.error('Error actualizando curso:', error);
      this.notificationService.showError('❌ Error al actualizar curso');
    }
  }

  async deleteCurso(id: string | undefined) {
    if (!this.canDeleteCurso() || !id) {
      this.notificationService.showError('No tienes permisos para eliminar cursos');
      return;
    }

    if (confirm('¿Estás seguro de eliminar este curso?')) {
      try {
        await this.cursoService.deleteCurso(id);
        this.notificationService.showSuccess('✅ Curso eliminado exitosamente');
        this.loadCursos();
      } catch (error) {
        console.error('Error eliminando curso:', error);
        this.notificationService.showError('❌ Error al eliminar curso');
      }
    }
  }

  resetForm() {
    this.newCurso = {
      nombre: '',
      descripcion: '',
      fechaInicio: undefined,
      fechaFin: undefined,
      nomRepresentante: '',
      numRepresentantes: '',
      instructorIds: [],
      personasIds: []
    };
    
    this.editingCurso = {
      nombre: '',
      descripcion: '',
      fechaInicio: undefined,
      fechaFin: undefined,
      nomRepresentante: '',
      numRepresentantes: '',
      instructorIds: [],
      personasIds: []
    };
    
    this.editingId = null;
    this.showForm = false;
  }

  formatDate(date: Date | string | null | undefined): string | null {
    if (!date) return null;
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  }
}