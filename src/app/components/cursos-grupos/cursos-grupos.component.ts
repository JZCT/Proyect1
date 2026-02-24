import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { CursoService } from '../../services/curso.service';
import { PersonaService } from '../../services/persona.service';
import { AuthService } from '../../services/auth.service';

import { Curso } from '../../models/curso.model';
import { Persona } from '../../models/persona.model';

@Component({
  selector: 'app-cursos-grupos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cursos-grupos.component.html',
  styleUrl: './cursos-grupos.component.scss'
})
export class CursosGruposComponent implements OnInit {

  /* ================= USER ================= */

  // 👇 usado por el HTML: currentUser$ | async as user
  currentUser$ = this.authService.currentUser$;

  /* ================= DATA ================= */

  cursos: Curso[] = [];
  personas: Persona[] = [];

  selectedCurso: Curso | null = null;

  personasEnCurso: Persona[] = [];
  personasDisponibles: Persona[] = [];

  selectedPersonaToAdd: number | null = null;

  /* ================= FORM ================= */

  showCursoForm = false;

  newCurso: Curso = {
    nombre: '',
    descripcion: '',
    Fecha_inicio: undefined,
    Fecha_fin: undefined,
    nom_representante: '',
    num_represnetantes: ''
  };

  editingCursoId: number | null = null;

  editingCurso: Curso = {
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
  ) {}

  /* ================= INIT ================= */

  ngOnInit(): void {
    this.loadCursos();
    this.loadPersonas();
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

  /* ===== ROLE HELPERS (🔥 LIMPIO) ===== */

  get currentUser() {
    return this.authService.getCurrentUser();
  }

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
    if (!this.selectedCurso) return false;

    return !!(
      this.isAdmin() ||
      (
        this.isInstructor() &&
        this.currentUser?.assignedCourseIds?.includes(
          this.selectedCurso.id || 0
        )
      )
    );
  }

  /* ================= LOAD DATA ================= */

  loadCursos() {
    this.cursoService.getCursos().subscribe(cursos => {
      this.cursos = cursos;
    });
  }

  loadPersonas() {
    this.personaService.getPersonas().subscribe(personas => {
      this.personas = personas;
      if (this.selectedCurso) this.updatePersonasEnCurso();
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
      assignedIds.includes(p.id || 0)
    );

    this.personasDisponibles = this.personas.filter(p =>
      !assignedIds.includes(p.id || 0)
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

  addCurso() {
    if (!this.canManageCurso()) return;

    if (
      this.newCurso.nombre &&
      this.newCurso.descripcion &&
      this.newCurso.Fecha_inicio &&
      this.newCurso.Fecha_fin &&
      this.newCurso.nom_representante &&
      this.newCurso.num_represnetantes
    ) {
      this.cursoService.addCurso({
        ...this.newCurso,
        personasIds: []
      });

      this.resetCursoForm();
    }
  }

  startEditCurso(curso: Curso) {
    if (!this.canManageCurso()) return;

    this.editingCursoId = curso.id || null;
    this.editingCurso = { ...curso };
    this.showCursoForm = true;
  }

  updateCurso() {
    if (!this.canManageCurso()) return;

    if (this.editingCursoId) {
      this.cursoService.updateCurso(
        this.editingCursoId,
        this.editingCurso
      );

      this.resetCursoForm();
    }
  }

  deleteCurso(id: number | undefined) {
    if (!this.canManageCurso()) return;

    if (id && confirm('¿Estás seguro?')) {
      this.cursoService.deleteCurso(id);
      this.selectedCurso = null;
      this.personasEnCurso = [];
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

  addPersonaToCurso(personaId: number | null) {
    if (!this.selectedCurso || !personaId) return;
    if (!this.canManagePersonas()) return;

    this.cursoService.addPersonaToCurso(
      this.selectedCurso.id || 0,
      personaId
    );

    this.updatePersonasEnCurso();
    this.selectedPersonaToAdd = null;
  }

  removePersonaFromCurso(personaId: number | undefined) {
    if (!this.selectedCurso || !personaId) return;
    if (!this.canManagePersonas()) return;

    this.cursoService.removePersonaFromCurso(
      this.selectedCurso.id || 0,
      personaId
    );

    this.updatePersonasEnCurso();
  }
}