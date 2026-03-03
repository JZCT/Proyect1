import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';

import { CursoService } from '../../services/curso.service';
import { PersonaService } from '../../services/persona.service';
import { AuthService } from '../../services/auth.service';
import { InstructorService } from '../../services/instructor.service';
import { NotificationService } from '../../services/notification.service';

import { Curso } from '../../models/curso.model';
import { Persona } from '../../models/persona.model';
import { Instructor } from '../../models/instructor.model';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-cursos-grupos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cursos-grupos.component.html',
  styleUrl: './cursos-grupos.component.scss'
})
export class CursosGruposComponent implements OnInit {
  /* ================= USER ================= */
  currentUser$: Observable<any>;
  currentUser: User | null = null;

  /* ================= DATA CURSOS ================= */
  cursos: Curso[] = [];
  selectedCurso: Curso | null = null;

  /* ================= DATA PERSONAS ================= */
  personas: Persona[] = [];
  personasEnCurso: Persona[] = [];
  personasDisponibles: Persona[] = [];
  selectedPersonaToAdd: string | null = null;

  /* ================= DATA INSTRUCTORES ================= */
  instructores: Instructor[] = [];
  instructoresEnCurso: Instructor[] = [];
  instructoresDisponibles: Instructor[] = [];
  selectedInstructorToAdd: string | null = null;
  maxInstructoresAlcanzado = false;

  /* ================= FORM CURSOS ================= */
  showCursoForm = false;

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

  editingCursoId: string | null = null;

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

  /* ================= CONSTRUCTOR ================= */
  constructor(
    private cursoService: CursoService,
    private personaService: PersonaService,
    private authService: AuthService,
    private instructorService: InstructorService,
    private notificationService: NotificationService
  ) {
    this.currentUser$ = this.authService.currentUser$;
  }

  /* ================= INIT ================= */
  ngOnInit(): void {
    this.loadCurrentUser();
    this.loadCursos();
    this.loadPersonas();
    this.loadInstructores();
  }

  /* ================= LOAD USER ================= */
  private loadCurrentUser() {
    this.authService.currentUser$.subscribe(async (firebaseUser) => {
      if (firebaseUser) {
        const userData = await this.authService.getUserData(firebaseUser.uid);
        this.currentUser = userData;
      } else {
        this.currentUser = null;
      }
    });
  }

  /* ================= HELPERS ================= */
  formatDate(date: Date | string | null | undefined): string | null {
    if (!date) return null;
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /* ===== ROLE HELPERS ===== */
  isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  isInstructor(): boolean {
    return this.currentUser?.role === 'instructor';
  }

  isCompany(): boolean {
    return this.currentUser?.role === 'company';
  }

  canManageCurso(): boolean {
    return this.isAdmin();
  }

  canManagePersonas(): boolean {
    if (!this.selectedCurso || !this.currentUser) return false;
    
    if (this.isAdmin()) return true;
    
    if (this.isInstructor()) {
      return this.currentUser?.assignedCourseIds?.includes(
        this.selectedCurso.id || ''
      ) || false;
    }
    
    return false;
  }

  canManageInstructores(): boolean {
    return this.isAdmin();
  }

  canViewCurso(): boolean {
    return true;
  }

  /* ================= LOAD DATA ================= */
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

  loadPersonas() {
    this.personaService.getPersonas().subscribe({
      next: (personas) => {
        this.personas = personas;
        if (this.selectedCurso) {
          this.updatePersonasEnCurso();
        }
        console.log('Personas cargadas:', personas);
      },
      error: (error) => {
        console.error('Error cargando personas:', error);
        this.notificationService.showError('Error al cargar las personas');
      }
    });
  }

  loadInstructores() {
    this.instructorService.getInstructores().subscribe({
      next: (instructores) => {
        this.instructores = instructores;
        if (this.selectedCurso) {
          this.updateInstructoresEnCurso();
        }
        console.log('Instructores cargados:', instructores);
      },
      error: (error) => {
        console.error('Error cargando instructores:', error);
        this.notificationService.showError('Error al cargar los instructores');
      }
    });
  }

  /* ================= CURSO SELECTION ================= */
  selectCurso(curso: Curso) {
    this.selectedCurso = curso;
    this.updatePersonasEnCurso();
    this.updateInstructoresEnCurso();
  }

  /* ================= UPDATE PERSONAS ================= */
  updatePersonasEnCurso() {
    if (!this.selectedCurso) {
      this.personasEnCurso = [];
      this.personasDisponibles = this.personas;
      return;
    }

    const assignedIds = this.selectedCurso.personasIds || [];

    this.personasEnCurso = this.personas.filter(p =>
      assignedIds.includes(p.id || '')
    );

    this.personasDisponibles = this.personas.filter(p =>
      !assignedIds.includes(p.id || '')
    );
  }

  /* ================= UPDATE INSTRUCTORES ================= */
  async updateInstructoresEnCurso() {
    if (!this.selectedCurso) {
      this.instructoresEnCurso = [];
      this.instructoresDisponibles = this.instructores;
      this.maxInstructoresAlcanzado = false;
      return;
    }

    const assignedIds = this.selectedCurso.instructorIds || [];
    this.maxInstructoresAlcanzado = assignedIds.length >= 3;

    this.instructoresEnCurso = this.instructores.filter(i =>
      assignedIds.includes(i.id || '')
    );

    const disponibles: Instructor[] = [];
    
    for (const instructor of this.instructores) {
      if (!assignedIds.includes(instructor.id || '')) {
        const puedeAsignar = await this.instructorService.canAssignMoreCourses(instructor.id || '');
        if (puedeAsignar) {
          disponibles.push(instructor);
        }
      }
    }
    
    this.instructoresDisponibles = disponibles;
  }

  /* ================= CRUD CURSOS ================= */
  toggleCursoForm() {
    if (!this.canManageCurso()) {
      this.notificationService.showError('No tienes permisos para gestionar cursos');
      return;
    }
    this.showCursoForm = !this.showCursoForm;
    if (!this.showCursoForm) {
      this.resetCursoForm();
    }
  }

  async addCurso() {
    if (!this.canManageCurso()) return;

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
      this.resetCursoForm();
      this.notificationService.showSuccess('✅ Curso agregado exitosamente');
      this.loadCursos();
    } catch (error) {
      console.error('Error agregando curso:', error);
      this.notificationService.showError('❌ Error al agregar curso');
    }
  }

  startEditCurso(curso: Curso) {
    if (!this.canManageCurso()) {
      this.notificationService.showError('No tienes permisos para editar cursos');
      return;
    }
    this.editingCursoId = curso.id || null;
    this.editingCurso = { ...curso };
    this.showCursoForm = true;
  }

  async updateCurso() {
    if (!this.canManageCurso()) {
      this.notificationService.showError('No tienes permisos para editar cursos');
      return;
    }

    if (this.editingCursoId) {
      try {
        await this.cursoService.updateCurso(
          this.editingCursoId,
          this.editingCurso as Curso
        );
        this.resetCursoForm();
        this.notificationService.showSuccess('✅ Curso actualizado exitosamente');
        this.loadCursos();
      } catch (error) {
        console.error('Error actualizando curso:', error);
        this.notificationService.showError('❌ Error al actualizar curso');
      }
    }
  }

  async deleteCurso(id: string | undefined) {
    if (!this.canManageCurso()) {
      this.notificationService.showError('No tienes permisos para eliminar cursos');
      return;
    }

    if (id && confirm('¿Estás seguro de eliminar este curso?')) {
      try {
        await this.cursoService.deleteCurso(id);
        this.selectedCurso = null;
        this.personasEnCurso = [];
        this.instructoresEnCurso = [];
        this.notificationService.showSuccess('✅ Curso eliminado exitosamente');
        this.loadCursos();
      } catch (error) {
        console.error('Error eliminando curso:', error);
        this.notificationService.showError('❌ Error al eliminar curso');
      }
    }
  }

  resetCursoForm() {
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

    this.editingCursoId = null;
    this.showCursoForm = false;
  }

  /* ================= PERSONAS ================= */
  async addPersonaToCurso(personaId: string | null) {
    if (!this.selectedCurso || !personaId) {
      this.notificationService.showWarning('Selecciona una persona');
      return;
    }
    
    if (!this.canManagePersonas()) {
      this.notificationService.showError('No tienes permisos para asignar personas');
      return;
    }

    try {
      await this.cursoService.addPersonaToCurso(
        this.selectedCurso.id || '',
        personaId
      );
      
      await this.personaService.assignToCurso(personaId, this.selectedCurso.id || '');
      
      await this.loadCursos();
      await this.loadPersonas();
      
      setTimeout(() => {
        if (this.selectedCurso) {
          this.updatePersonasEnCurso();
        }
      }, 500);
      
      this.selectedPersonaToAdd = null;
      this.notificationService.showSuccess('✅ Persona asignada correctamente');
    } catch (error) {
      console.error('Error asignando persona:', error);
      this.notificationService.showError('❌ Error al asignar persona');
    }
  }

  async removePersonaFromCurso(personaId: string | undefined) {
    if (!this.selectedCurso || !personaId) return;
    
    if (!this.canManagePersonas()) {
      this.notificationService.showError('No tienes permisos para remover personas');
      return;
    }

    if (confirm('¿Remover esta persona del curso?')) {
      try {
        await this.cursoService.removePersonaFromCurso(
          this.selectedCurso.id || '',
          personaId
        );
        
        await this.personaService.removeFromCurso(personaId, this.selectedCurso.id || '');
        
        await this.loadCursos();
        await this.loadPersonas();
        
        setTimeout(() => {
          if (this.selectedCurso) {
            this.updatePersonasEnCurso();
          }
        }, 500);
        
        this.notificationService.showSuccess('✅ Persona removida del curso');
      } catch (error) {
        console.error('Error removiendo persona:', error);
        this.notificationService.showError('❌ Error al remover persona');
      }
    }
  }

  /* ================= INSTRUCTORES ================= */
  async addInstructorToCurso(instructorId: string | null) {
    if (!this.selectedCurso || !instructorId) {
      this.notificationService.showWarning('Selecciona un instructor');
      return;
    }
    
    if (!this.canManageInstructores()) {
      this.notificationService.showError('No tienes permisos para asignar instructores');
      return;
    }

    const result = await this.instructorService.assignInstructorToCurso(
      instructorId,
      this.selectedCurso.id || ''
    );

    if (result.success) {
      await this.loadCursos();
      await this.loadInstructores();
      
      setTimeout(() => {
        if (this.selectedCurso) {
          this.updateInstructoresEnCurso();
        }
      }, 500);
      
      this.selectedInstructorToAdd = null;
      this.notificationService.showSuccess(result.message);
    } else {
      this.notificationService.showError(result.message);
    }
  }

  async removeInstructorFromCurso(instructorId: string | undefined) {
    if (!this.selectedCurso || !instructorId) return;
    
    if (!this.canManageInstructores()) {
      this.notificationService.showError('No tienes permisos para remover instructores');
      return;
    }

    if (confirm('¿Remover este instructor del curso?')) {
      try {
        await this.instructorService.removeInstructorFromCurso(
          instructorId,
          this.selectedCurso.id || ''
        );
        
        await this.loadCursos();
        await this.loadInstructores();
        
        setTimeout(() => {
          if (this.selectedCurso) {
            this.updateInstructoresEnCurso();
          }
        }, 500);
        
        this.notificationService.showSuccess('✅ Instructor removido del curso');
      } catch (error) {
        console.error('Error removiendo instructor:', error);
        this.notificationService.showError('❌ Error al remover instructor');
      }
    }
  }

  /* ================= MANEJO DE ERRORES DE IMAGEN ================= */
  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement) {
      imgElement.src = 'assets/default-avatar.png';
    }
  }
}