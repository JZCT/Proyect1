import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';

import { CursoService } from '../../services/curso.service';
import { PersonaService } from '../../services/persona.service';
import { AuthService } from '../../services/auth.service';

import { Curso } from '../../models/curso.model';
import { Persona } from '../../models/persona.model';
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

  /* ================= DATA ================= */
  cursos: Curso[] = [];
  personas: Persona[] = [];

  selectedCurso: Curso | null = null;

  personasEnCurso: Persona[] = [];
  personasDisponibles: Persona[] = [];

  selectedPersonaToAdd: string | null = null; // Cambiado a string para Firebase

  /* ================= FORM ================= */
  showCursoForm = false;

  newCurso: Partial<Curso> = {
    nombre: '',
    descripcion: '',
    Fecha_inicio: undefined,
    Fecha_fin: undefined,
    nom_representante: '',
    num_represnetantes: ''
  };

  editingCursoId: string | null = null; // Cambiado a string

  editingCurso: Partial<Curso> = {
    nombre: '',
    descripcion: '',
    Fecha_inicio: undefined,
    Fecha_fin: undefined,
    nom_representante: '',
    num_represnetantes: ''
  };

  /* ================= CONSTRUCTOR ================= */
  constructor(
    private cursoService: CursoService,
    private personaService: PersonaService,
    private authService: AuthService
  ) {
    this.currentUser$ = this.authService.currentUser$;
  }

  /* ================= INIT ================= */
  ngOnInit(): void {
    this.loadCurrentUser();
    this.loadCursos();
    this.loadPersonas();
  }

  /* ================= LOAD USER ================= */
  private loadCurrentUser() {
    this.authService.currentUser$.subscribe(async (firebaseUser) => {
      if (firebaseUser) {
        // Obtener datos adicionales del usuario desde Firestore
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

  canManageCurso(): boolean {
    return this.isAdmin();
  }

  canManagePersonas(): boolean {
    if (!this.selectedCurso || !this.currentUser) return false;

    return !!(
      this.isAdmin() ||
      (
        this.isInstructor() &&
        this.currentUser?.assignedCourseIds?.includes(
          this.selectedCurso.id || ''
        )
      )
    );
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
      }
    });
  }

  loadPersonas() {
    this.personaService.getPersonas().subscribe({
      next: (personas) => {
        this.personas = personas;
        if (this.selectedCurso) this.updatePersonasEnCurso();
        console.log('Personas cargadas:', personas);
      },
      error: (error) => {
        console.error('Error cargando personas:', error);
      }
    });
  }

  /* ================= CURSO SELECTION ================= */
  selectCurso(curso: Curso) {
    this.selectedCurso = curso;
    this.updatePersonasEnCurso();
  }

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

  /* ================= CRUD CURSOS ================= */
  toggleCursoForm() {
    if (!this.canManageCurso()) return;

    this.showCursoForm = !this.showCursoForm;

    if (!this.showCursoForm) {
      this.resetCursoForm();
    }
  }

  async addCurso() {
    if (!this.canManageCurso()) return;

    if (
      this.newCurso.nombre &&
      this.newCurso.descripcion &&
      this.newCurso.Fecha_inicio &&
      this.newCurso.Fecha_fin &&
      this.newCurso.nom_representante &&
      this.newCurso.num_represnetantes
    ) {
      try {
        await this.cursoService.addCurso({
          ...this.newCurso as Curso,
          personasIds: []
        });
        this.resetCursoForm();
      } catch (error) {
        console.error('Error agregando curso:', error);
        alert('Error al agregar curso');
      }
    }
  }

  startEditCurso(curso: Curso) {
    if (!this.canManageCurso()) return;

    this.editingCursoId = curso.id || null;
    this.editingCurso = { ...curso };
    this.showCursoForm = true;
  }

  async updateCurso() {
    if (!this.canManageCurso()) return;

    if (this.editingCursoId) {
      try {
        await this.cursoService.updateCurso(
          this.editingCursoId,
          this.editingCurso as Curso
        );
        this.resetCursoForm();
      } catch (error) {
        console.error('Error actualizando curso:', error);
        alert('Error al actualizar curso');
      }
    }
  }

  async deleteCurso(id: string | undefined) {
    if (!this.canManageCurso()) return;

    if (id && confirm('¿Estás seguro de eliminar este curso?')) {
      try {
        await this.cursoService.deleteCurso(id);
        this.selectedCurso = null;
        this.personasEnCurso = [];
      } catch (error) {
        console.error('Error eliminando curso:', error);
        alert('Error al eliminar curso');
      }
    }
  }

  resetCursoForm() {
    this.newCurso = {
      nombre: '',
      descripcion: '',
      Fecha_inicio: undefined,
      Fecha_fin: undefined,
      nom_representante: '',
      num_represnetantes: ''
    };

    this.editingCursoId = null;
    this.showCursoForm = false;
  }

  /* ================= PERSONAS ================= */
  async addPersonaToCurso(personaId: string | null) {
    if (!this.selectedCurso || !personaId) return;
    if (!this.canManagePersonas()) return;

    try {
      await this.cursoService.addPersonaToCurso(
        this.selectedCurso.id || '',
        personaId
      );
      this.updatePersonasEnCurso();
      this.selectedPersonaToAdd = null;
    } catch (error) {
      console.error('Error agregando persona al curso:', error);
      alert('Error al agregar persona al curso');
    }
  }

  async removePersonaFromCurso(personaId: string | undefined) {
    if (!this.selectedCurso || !personaId) return;
    if (!this.canManagePersonas()) return;

    try {
      await this.cursoService.removePersonaFromCurso(
        this.selectedCurso.id || '',
        personaId
      );
      this.updatePersonasEnCurso();
    } catch (error) {
      console.error('Error removiendo persona del curso:', error);
      alert('Error al remover persona del curso');
    }
  }
}