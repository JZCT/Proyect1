import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';

import { CursoService } from '../../services/curso.service';
import { InstructorService } from '../../services/instructor.service';
import { PersonaService } from '../../services/persona.service';
import { AuthService } from '../../services/auth.service';

import { Curso } from '../../models/curso.model';
import { Instructor } from '../../models/instructor.model';
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
  private readonly MIN_CALIFICACION_APTO = 80;
  currentUser$: Observable<User | null>;
  currentUser: User | null = null;

  cursos: Curso[] = [];
  allCursos: Curso[] = [];
  personas: Persona[] = [];
  instructores: Instructor[] = [];
  companyTags: string[] = [];

  selectedCurso: Curso | null = null;

  personasEnCurso: Persona[] = [];
  personasDisponibles: Persona[] = [];
  resumenCalificaciones = {
    aptos: 0,
    noAptos: 0,
    sinEvaluar: 0
  };
  instructoresEnCurso: Instructor[] = [];
  defaultInstructorImg = 'assets/default-avatar.png';

  selectedPersonaToAdd: string | null = null;
  cursoSearchTerm: string = '';
  cursoTagSearchTerm: string = '';
  personaSearchTerm: string = '';
  personaDisponibleSearchTerm: string = '';
  resultadoFilter: 'all' | 'apto' | 'noApto' | 'sinEvaluar' = 'all';
  savingCalificaciones: Record<string, boolean> = {};

  showCursoForm = false;

  newCurso: Partial<Curso> = {
    nombre: '',
    descripcion: '',
    Fecha_inicio: undefined,
    Fecha_fin: undefined,
    nom_representante: '',
    num_represnetantes: '',
    companyTag: ''
  };

  editingCursoId: string | null = null;

  editingCurso: Partial<Curso> = {
    nombre: '',
    descripcion: '',
    Fecha_inicio: undefined,
    Fecha_fin: undefined,
    nom_representante: '',
    num_represnetantes: '',
    companyTag: ''
  };

  constructor(
    private cursoService: CursoService,
    private instructorService: InstructorService,
    private personaService: PersonaService,
    private authService: AuthService
  ) {
    this.currentUser$ = this.authService.currentUserData$;
  }

  ngOnInit(): void {
    this.loadCurrentUser();
    this.loadCompanyTags();
    this.loadCursos();
    this.loadPersonas();
    this.loadInstructores();
  }

  private loadCurrentUser() {
    this.currentUser$.subscribe((userData) => {
      this.currentUser = userData;
      this.applyCursoFilter();
    });
  }

  formatDate(date: Date | string | null | undefined): string | null {
    if (!date) return null;

    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
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
    if (!this.selectedCurso || !this.currentUser) return false;

    return this.isAdmin() || this.isInstructor();
  }

  loadCursos() {
    this.cursoService.getCursos().subscribe({
      next: (cursos) => {
        this.allCursos = cursos;
        this.applyCursoFilter();
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
      },
      error: (error) => {
        console.error('Error cargando personas:', error);
      }
    });
  }

  loadInstructores() {
    this.instructorService.getInstructores().subscribe({
      next: (instructores) => {
        this.instructores = instructores;
        if (this.selectedCurso) this.updateInstructoresEnCurso();
      },
      error: (error) => {
        console.error('Error cargando instructores:', error);
      }
    });
  }

  loadCompanyTags() {
    this.authService.getCompanyTags().subscribe({
      next: (tags) => {
        this.companyTags = tags;
      },
      error: (error) => {
        console.error('Error cargando etiquetas de empresa:', error);
      }
    });
  }

  selectCurso(curso: Curso) {
    this.selectedCurso = curso;
    this.resultadoFilter = 'all';
    this.updatePersonasEnCurso();
    this.updateInstructoresEnCurso();
  }

  updatePersonasEnCurso() {
    if (!this.selectedCurso) {
      this.personasEnCurso = [];
      this.personasDisponibles = this.personas;
      this.instructoresEnCurso = [];
      this.updateResumenCalificaciones();
      return;
    }

    const assignedIds = this.selectedCurso.personasIds || [];

    this.personasEnCurso = this.personas.filter((p) => assignedIds.includes(p.id || ''));

    this.personasDisponibles = this.personas.filter((p) => !assignedIds.includes(p.id || ''));

    this.updateResumenCalificaciones();
    this.updateInstructoresEnCurso();
  }

  updateInstructoresEnCurso() {
    if (!this.selectedCurso) {
      this.instructoresEnCurso = [];
      return;
    }

    const assignedInstructorIds = this.selectedCurso.instructorIds || [];
    this.instructoresEnCurso = this.instructores.filter((instructor) =>
      assignedInstructorIds.includes(instructor.id || '')
    );
  }

  onInstructorImgError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.onerror = null;
    img.src = this.defaultInstructorImg;
  }

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
      this.newCurso.num_represnetantes &&
      this.newCurso.companyTag &&
      this.newCurso.companyTag.trim()
    ) {
      try {
        await this.cursoService.addCurso({
          ...(this.newCurso as Curso),
          companyTag: this.normalizeCompanyTag(this.newCurso.companyTag),
          personasIds: []
        });
        this.resetCursoForm();
      } catch (error) {
        console.error('Error agregando curso:', error);
        alert('Error al agregar curso');
      }
    } else {
      alert('Completa todos los campos, incluyendo etiqueta de empresa');
    }
  }

  startEditCurso(curso: Curso) {
    if (!this.canManageCurso()) return;

    this.editingCursoId = curso.idcurso || null;
    this.editingCurso = { ...curso };
    this.showCursoForm = true;
  }

  async updateCurso() {
    if (!this.canManageCurso()) return;

    if (this.editingCursoId) {
      if (!this.editingCurso.companyTag || !this.editingCurso.companyTag.trim()) {
        alert('La etiqueta de empresa es requerida');
        return;
      }

      try {
        await this.cursoService.updateCurso(this.editingCursoId, {
          ...this.editingCurso,
          companyTag: this.normalizeCompanyTag(this.editingCurso.companyTag)
        } as Curso);
        this.resetCursoForm();
      } catch (error) {
        console.error('Error actualizando curso:', error);
        alert('Error al actualizar curso');
      }
    }
  }

  async deleteCurso(id: string | undefined) {
    if (!this.canManageCurso()) return;

    if (id && confirm('Estas seguro de eliminar este curso?')) {
      try {
        await this.cursoService.deleteCurso(id);
        this.selectedCurso = null;
        this.personasEnCurso = [];
        this.instructoresEnCurso = [];
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
      num_represnetantes: '',
      companyTag: ''
    };

    this.editingCurso = {
      nombre: '',
      descripcion: '',
      Fecha_inicio: undefined,
      Fecha_fin: undefined,
      nom_representante: '',
      num_represnetantes: '',
      companyTag: ''
    };

    this.editingCursoId = null;
    this.showCursoForm = false;
  }

  async addPersonaToCurso(personaId: string | null) {
    if (!this.selectedCurso || !personaId) return;
    if (!this.canManagePersonas()) return;

    try {
      await this.cursoService.addPersonaToCurso(this.selectedCurso.idcurso || '', personaId);
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
      await this.cursoService.removePersonaFromCurso(this.selectedCurso.idcurso || '', personaId);
      this.updatePersonasEnCurso();
    } catch (error) {
      console.error('Error removiendo persona del curso:', error);
      alert('Error al remover persona del curso');
    }
  }

  async removeInstructorFromCurso(instructorId: string | undefined) {
    if (!this.selectedCurso || !instructorId) return;
    if (!this.canManagePersonas()) return;
  }

  onCalificacionChange(persona: Persona, field: 'clfPractica' | 'clfTeorica', value: unknown) {
    const normalized = this.normalizeScoreForEdit(value);
    persona[field] = normalized === null ? undefined : normalized;
  }

  async saveCalificaciones(persona: Persona) {
    if (!this.canManagePersonas() || !persona.id) return;

    this.savingCalificaciones[persona.id] = true;
    try {
      const clfPractica = this.normalizeScoreForEdit(persona.clfPractica);
      const clfTeorica = this.normalizeScoreForEdit(persona.clfTeorica);

      await this.personaService.updatePersona(persona.id, {
        clfPractica: clfPractica === null ? undefined : clfPractica,
        clfTeorica: clfTeorica === null ? undefined : clfTeorica
      });

      persona.clfPractica = clfPractica === null ? undefined : clfPractica;
      persona.clfTeorica = clfTeorica === null ? undefined : clfTeorica;
      this.updateResumenCalificaciones();
    } catch (error) {
      console.error('Error guardando calificaciones:', error);
      alert('No se pudieron guardar las calificaciones');
    } finally {
      this.savingCalificaciones[persona.id] = false;
    }
  }

  getCalificacionFinal(persona: Partial<Persona>): number | null {
    const practica = this.getValidScore(persona.clfPractica);
    const teorica = this.getValidScore(persona.clfTeorica);

    if (practica === null || teorica === null) {
      return null;
    }

    return Math.round(((practica + teorica) / 2) * 10) / 10;
  }

  getResultadoTexto(persona: Partial<Persona>): string {
    const final = this.getCalificacionFinal(persona);
    if (final === null) return 'Sin evaluar';
    return final >= this.MIN_CALIFICACION_APTO ? 'Apto' : 'No apto';
  }

  getResultadoClase(persona: Partial<Persona>): string {
    const resultado = this.getResultadoTexto(persona);
    if (resultado === 'Apto') return 'status-apto';
    if (resultado === 'No apto') return 'status-no-apto';
    return 'status-sin-evaluar';
  }

  formatCalificacion(value: unknown): string {
    const score = this.getValidScore(value);
    return score === null ? '-' : score.toFixed(1);
  }

  private updateResumenCalificaciones() {
    let aptos = 0;
    let noAptos = 0;
    let sinEvaluar = 0;

    for (const persona of this.personasEnCurso) {
      const resultado = this.getResultadoTexto(persona);
      if (resultado === 'Apto') aptos++;
      else if (resultado === 'No apto') noAptos++;
      else sinEvaluar++;
    }

    this.resumenCalificaciones = { aptos, noAptos, sinEvaluar };
  }

  private getValidScore(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) return null;
    return Math.max(0, Math.min(100, numericValue));
  }

  private applyCursoFilter() {
    if (!this.currentUser) {
      this.cursos = this.allCursos;
      this.syncSelectedCurso();
      return;
    }

    if (this.currentUser.role !== 'company') {
      this.cursos = this.allCursos;
      this.syncSelectedCurso();
      return;
    }

    const companyTag = this.normalizeCompanyTag(this.currentUser.companyTag);
    if (!companyTag) {
      this.cursos = [];
      this.syncSelectedCurso();
      return;
    }

    this.cursos = this.allCursos.filter(
      (curso) => this.normalizeCompanyTag(curso.companyTag) === companyTag
    );
    this.syncSelectedCurso();
  }

  private syncSelectedCurso() {
    if (!this.selectedCurso) return;

    const selectedId = this.selectedCurso.idcurso;
    const updatedSelection = this.cursos.find((curso) => curso.idcurso === selectedId) || null;
    this.selectedCurso = updatedSelection;

    if (!this.selectedCurso) {
      this.personasEnCurso = [];
      this.personasDisponibles = this.personas;
      this.instructoresEnCurso = [];
      this.updateResumenCalificaciones();
      this.selectedPersonaToAdd = null;
      return;
    }

    this.updatePersonasEnCurso();
    this.updateInstructoresEnCurso();
  }

  private normalizeCompanyTag(tag?: string): string {
    return (tag || '').trim().toLowerCase();
  }

  getCompanyTagOptions(currentTag?: string): string[] {
    const normalizedCurrent = this.normalizeCompanyTag(currentTag);
    if (!normalizedCurrent) return this.companyTags;
    return Array.from(new Set([...this.companyTags, normalizedCurrent]));
  }

  get filteredCursosList(): Curso[] {
    const term = this.normalizeSearch(this.cursoSearchTerm);
    const tagTerm = this.normalizeSearch(this.cursoTagSearchTerm);
    if (!term && !tagTerm) return this.cursos;

    return this.cursos.filter((curso) => {
      const target = this.normalizeText([
        curso.nombre,
        curso.descripcion,
        curso.companyTag || '',
        curso.nom_representante,
        curso.num_represnetantes
      ]
        .join(' '));

      const normalizedTag = this.normalizeSearch(curso.companyTag || '');
      const matchesGeneral = !term || target.includes(term);
      const matchesTag = !tagTerm || normalizedTag.includes(tagTerm);
      return matchesGeneral && matchesTag;
    });
  }

  get filteredPersonasEnCurso(): Persona[] {
    const term = this.normalizeSearch(this.personaSearchTerm);
    return this.personasEnCurso.filter((persona) => {
      const matchesSearch = !term || this.getPersonaSearchTarget(persona).includes(term);
      const matchesResultado = this.matchesResultadoFilter(persona);
      return matchesSearch && matchesResultado;
    });
  }

  get filteredPersonasDisponibles(): Persona[] {
    const term = this.normalizeSearch(this.personaDisponibleSearchTerm);
    if (!term) return this.personasDisponibles;

    return this.personasDisponibles.filter((persona) =>
      this.getPersonaSearchTarget(persona).includes(term)
    );
  }

  private getPersonaSearchTarget(persona: Persona): string {
    return this.normalizeText([
      persona.nombre,
      persona.curp || '',
      persona.email,
      persona.telefono || '',
      persona.empresa || '',
      persona.lugar || '',
      this.getResultadoTexto(persona)
      ]
      .join(' '));
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

  getResultadoFilterCount(filter: 'all' | 'apto' | 'noApto' | 'sinEvaluar'): number {
    if (filter === 'all') return this.personasEnCurso.length;
    return this.personasEnCurso.filter((persona) => this.matchesResultadoFilter(persona, filter)).length;
  }

  setResultadoFilter(filter: 'all' | 'apto' | 'noApto' | 'sinEvaluar') {
    this.resultadoFilter = filter;
  }

  private matchesResultadoFilter(
    persona: Persona,
    filter: 'all' | 'apto' | 'noApto' | 'sinEvaluar' = this.resultadoFilter
  ): boolean {
    if (filter === 'all') return true;
    const resultado = this.getResultadoTexto(persona);
    if (filter === 'apto') return resultado === 'Apto';
    if (filter === 'noApto') return resultado === 'No apto';
    return resultado === 'Sin evaluar';
  }

  private normalizeScoreForEdit(value: unknown): number | null {
    const score = this.getValidScore(value);
    return score === null ? null : Math.round(score * 10) / 10;
  }
}
