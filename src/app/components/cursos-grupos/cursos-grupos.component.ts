import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Observable, Subscription } from 'rxjs';

import { CursoService } from '../../services/curso.service';
import { InstructorService } from '../../services/instructor.service';
import { PersonaService } from '../../services/persona.service';
import { AuthService } from '../../services/auth.service';
import { CursoEntregableReportRow, ReportData, ReportService } from '../../services/report.service';
import { NotificationService } from '../../services/notification.service';
import { ViewStateService } from '../../services/view-state.service';

import { Curso } from '../../models/curso.model';
import { Instructor } from '../../models/instructor.model';
import { Persona } from '../../models/persona.model';
import { User } from '../../models/user.model';
import { COURSE_ASSIGNMENT_GRACE_MONTHS } from '../../config/global.constants';
import { coerceDate } from '../../utils/date.util';
import { isCursoCaducadoParaAsignacion } from '../../utils/course-availability.util';
import { resolveAppAssetUrl } from '../../utils/asset-url.util';
import { sanitizePhoneInput, sanitizeScoreInput } from '../../utils/input-sanitizers.util';

type CursoArchivo = NonNullable<Curso['archivos']>[number] & {
  file?: File;
};
type FilePreviewType = 'pdf' | 'image' | 'text' | 'unsupported';
type CursosGruposSearchState = {
  cursoSearchTerm: string;
  cursoCityFilter: string;
  personaSearchTerm: string;
  personaDisponibleSearchTerm: string;
};

type FilteredCursosListCache = {
  source: Curso[];
  term: string;
  cityFilter: string;
  sortBy: 'nombre' | 'empresa' | 'dia';
  sortDirection: 'asc' | 'desc';
  result: Curso[];
};

type FilteredPersonasEnCursoCache = {
  source: Persona[];
  term: string;
  sortBy: 'nombre' | 'empresa' | 'final';
  sortDirection: 'asc' | 'desc';
  resultadoFilter: 'all' | 'apto' | 'noApto' | 'sinEvaluar';
  revision: number;
  result: Persona[];
};

type FilteredPersonasDisponiblesCache = {
  source: Persona[];
  term: string;
  sortBy: 'nombre' | 'empresa' | 'final';
  sortDirection: 'asc' | 'desc';
  result: Persona[];
};

@Component({
  selector: 'app-cursos-grupos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cursos-grupos.component.html',
  styleUrl: './cursos-grupos.component.scss'
})
export class CursosGruposComponent implements OnInit, OnDestroy {
  private readonly MIN_CALIFICACION_APTO = 80;
  private readonly PERSONAS_QUERY_LIMIT = 250;
  private readonly CURRENT_YEAR = new Date().getFullYear();
  private readonly SEARCH_STATE_KEY = 'cursos-grupos';
  private personasLoadSequence = 0;
  private selectedCursoReloadKey = '';
  private personasFilterRevision = 0;
  private filteredCursosListCache: FilteredCursosListCache | null = null;
  private filteredPersonasEnCursoCache: FilteredPersonasEnCursoCache | null = null;
  private filteredPersonasDisponiblesCache: FilteredPersonasDisponiblesCache | null = null;
  private cursosSubscription: Subscription | null = null;
  private personaDisponibleSearchTimer: ReturnType<typeof setTimeout> | null = null;
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
  defaultInstructorImg = resolveAppAssetUrl('assets/default-avatar.png');

  selectedPersonaToAdd: string | null = null;
  autoAssigningPersonas = false;
  loadingCursos = false;
  cursoFilterEnabled = false;
  cursoFilterMode: 'single' | 'range' = 'single';
  cursoSinglePeriod = `${this.CURRENT_YEAR}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  cursoRangeStart = `${this.CURRENT_YEAR}-01`;
  cursoRangeEnd = `${this.CURRENT_YEAR}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  cursoSearchTerm: string = '';
  cursoCityFilter: string = '';
  cursoSortBy: 'nombre' | 'empresa' | 'dia' = 'nombre';
  cursoSortDirection: 'asc' | 'desc' = 'asc';
  personaSearchTerm: string = '';
  personaDisponibleSearchTerm: string = '';
  personaSortBy: 'nombre' | 'empresa' | 'final' = 'nombre';
  personaSortDirection: 'asc' | 'desc' = 'asc';
  resultadoFilter: 'all' | 'apto' | 'noApto' | 'sinEvaluar' = 'all';
  savingCalificaciones: Record<string, boolean> = {};
  removingPersonasIds: Record<string, boolean> = {};
  exportingCursoReport = false;
  exportingCompanyCoursesReport = false;
  exportingCompanyEntregablesReport = false;
  exportingCompanyPersonasExcelReport = false;
  savingCurso = false;
  deletingCursoId: string | null = null;
  deletingArchivoKey: string | null = null;
  loadingArchivos = false;
  showFilePreview = false;
  showImagePreview = false;
  imagePreviewUrl = '';
  imagePreviewName = '';
  previewFile: CursoArchivo | null = null;
  previewType: FilePreviewType = 'unsupported';
  previewText = '';
  previewResourceUrl: SafeResourceUrl | null = null;
  previewOpenUrl: string | null = null;
  previewError = '';

  showCursoForm = false;

  newCurso: Partial<Curso> = {
    nombre: '',
    descripcion: '',
    dia: undefined,
    nom_representante: '',
    num_represnetantes: '',
    companyTag: '',
    archivos: []
  };

  editingCursoId: string | null = null;

  editingCurso: Partial<Curso> = {
    nombre: '',
    descripcion: '',
    dia: undefined,
    nom_representante: '',
    num_represnetantes: '',
    companyTag: '',
    archivos: []
  };

  constructor(
    private cursoService: CursoService,
    private instructorService: InstructorService,
    private personaService: PersonaService,
    private authService: AuthService,
    private reportService: ReportService,
    private notificationService: NotificationService,
    private sanitizer: DomSanitizer,
    private viewStateService: ViewStateService
  ) {
    this.currentUser$ = this.authService.currentUserData$;
  }

  updateCurrentRepresentativePhone(value: unknown): void {
    const telefono = sanitizePhoneInput(value);

    if (this.editingCursoId) {
      this.editingCurso.num_represnetantes = telefono;
      return;
    }

    this.newCurso.num_represnetantes = telefono;
  }

  ngOnInit(): void {
    this.restoreSearchState();
    this.loadCurrentUser();
    this.loadCompanyTags();
    this.loadCursos();
    this.loadInstructores();
  }

  ngOnDestroy(): void {
    this.persistSearchState();
    if (this.cursosSubscription) {
      this.cursosSubscription.unsubscribe();
      this.cursosSubscription = null;
    }

    if (this.personaDisponibleSearchTimer) {
      clearTimeout(this.personaDisponibleSearchTimer);
      this.personaDisponibleSearchTimer = null;
    }

    this.closeArchivoPreview();
    this.closeImagePreview();
    this.revokeObjectUrls(this.newCurso.archivos as CursoArchivo[] | undefined);
    this.revokeObjectUrls(this.editingCurso.archivos as CursoArchivo[] | undefined);
  }

  private loadCurrentUser() {
    this.currentUser$.subscribe((userData) => {
      this.currentUser = userData;
      this.applyCursoFilter();
    });
  }

  formatDate(date: Date | string | null | undefined): string | null {
    const parsed = coerceDate(date);
    if (!parsed) return null;
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  isInstructor(): boolean {
    return this.currentUser?.role === 'instructor';
  }

  isDirector(): boolean {
    return this.currentUser?.role === 'director';
  }

  canManageCurso(): boolean {
    return this.isAdmin();
  }

  canManageCursoFiles(): boolean {
    return this.currentUser?.role === 'admin';
  }

  canManagePersonas(): boolean {
    if (!this.selectedCurso || !this.currentUser) return false;

    return this.isAdmin() || this.isInstructor();
  }

  canExportCursoReport(): boolean {
    return !!this.selectedCurso && !!this.currentUser;
  }

  get canExportCompanyGlobalReports(): boolean {
    return this.currentUser?.role === 'company';
  }

  loadCursos() {
    this.loadingCursos = true;
    this.cursosSubscription?.unsubscribe();
    const singlePeriod = this.cursoFilterEnabled && this.cursoFilterMode === 'single'
      ? this.parseMonthRangeValue(this.cursoSinglePeriod)
      : null;
    const rangeFilter = this.cursoFilterEnabled && this.cursoFilterMode === 'range'
      ? this.resolveCursoRangeInputs(false)
      : null;

    if (this.cursoFilterEnabled && this.cursoFilterMode === 'single' && !singlePeriod) {
      this.loadingCursos = false;
      return;
    }

    if (this.cursoFilterEnabled && this.cursoFilterMode === 'range' && !rangeFilter) {
      this.loadingCursos = false;
      return;
    }

    this.cursosSubscription = this.cursoService.getCursosByPeriod({
      year: this.cursoFilterEnabled && this.cursoFilterMode === 'single'
        ? (singlePeriod?.year ?? null)
        : null,
      month: this.cursoFilterEnabled && this.cursoFilterMode === 'single'
        ? (singlePeriod?.month ?? null)
        : null,
      startYear: this.cursoFilterEnabled && this.cursoFilterMode === 'range'
        ? (rangeFilter?.startYear ?? null)
        : null,
      startMonth: this.cursoFilterEnabled && this.cursoFilterMode === 'range'
        ? (rangeFilter?.startMonth ?? null)
        : null,
      endYear: this.cursoFilterEnabled && this.cursoFilterMode === 'range'
        ? (rangeFilter?.endYear ?? null)
        : null,
      endMonth: this.cursoFilterEnabled && this.cursoFilterMode === 'range'
        ? (rangeFilter?.endMonth ?? null)
        : null
    }).subscribe({
      next: (cursos) => {
        this.allCursos = cursos;
        this.applyCursoFilter();
        this.loadingCursos = false;
      },
      error: (error) => {
        console.error('Error cargando cursos:', error);
        this.loadingCursos = false;
      }
    });
  }
  clearCursoRangeFilter(): void {
    if (!this.cursoFilterEnabled) {
      return;
    }

    this.cursoFilterEnabled = false;
    this.loadCursos();
  }

  applyCursoRangeFilter(): void {
    if (this.cursoFilterMode === 'single') {
      const single = this.parseMonthRangeValue(this.cursoSinglePeriod);
      if (!single) {
        this.notificationService.warning('Selecciona un periodo valido');
        return;
      }
    } else {
      const range = this.resolveCursoRangeInputs(true);
      if (!range) {
        return;
      }
    }

    this.cursoFilterEnabled = true;
    this.loadCursos();
  }
  getCursoYearFilterLabel(): string {
    if (!this.cursoFilterEnabled) {
      return 'Todos los periodos';
    }

    if (this.cursoFilterMode === 'single') {
      const single = this.parseMonthRangeValue(this.cursoSinglePeriod);
      if (!single) {
        return 'Periodo invalido';
      }

      return `Periodo ${String(single.month).padStart(2, '0')}/${single.year}`;
    }

    const range = this.resolveCursoRangeInputs(false);
    if (!range) {
      return 'Rango invalido';
    }

    return `Rango ${String(range.startMonth).padStart(2, '0')}/${range.startYear} - ${String(range.endMonth).padStart(2, '0')}/${range.endYear}`;
  }

  private resolveCursoRangeInputs(showWarnings: boolean): {
    startYear: number;
    startMonth: number;
    endYear: number;
    endMonth: number;
  } | null {
    const startPeriod = this.parseMonthRangeValue(this.cursoRangeStart);
    const endPeriod = this.parseMonthRangeValue(this.cursoRangeEnd);

    if (!startPeriod || !endPeriod) {
      if (showWarnings) {
        this.notificationService.warning('Completa un rango valido de inicio y fin');
      }
      return null;
    }

    const startYear = startPeriod.year;
    const startMonth = startPeriod.month;
    const endYear = endPeriod.year;
    const endMonth = endPeriod.month;

    const startKey = (startYear * 100) + startMonth;
    const endKey = (endYear * 100) + endMonth;

    if (startKey <= endKey) {
      return { startYear, startMonth, endYear, endMonth };
    }

    return {
      startYear: endYear,
      startMonth: endMonth,
      endYear: startYear,
      endMonth: startMonth
    };
  }

  private parseMonthRangeValue(value: string): { year: number; month: number } | null {
    const normalized = (value || '').trim();
    const [yearToken, monthToken] = normalized.split('-');
    const year = this.normalizeYearInput(yearToken);
    const month = this.normalizeMonthInput(monthToken);

    if (!year || !month) {
      return null;
    }

    return { year, month };
  }

  async loadPersonas(options: { autoAssign?: boolean; reloadEnCurso?: boolean } = {}): Promise<void> {
    if (!this.selectedCurso?.idcurso) {
      this.personas = [];
      this.personasEnCurso = [];
      this.personasDisponibles = [];
      this.selectedCursoReloadKey = '';
      this.personasFilterRevision += 1;
      this.updateResumenCalificaciones();
      this.selectedPersonaToAdd = null;
      return;
    }

    const selectedCursoId = this.selectedCurso.idcurso;
    const companyTag = this.normalizeCompanyTag(this.selectedCurso.companyTag);
    const cursoAssignmentPeriod = this.resolveCursoAssignmentPeriod(this.selectedCurso);
    const loadSequence = ++this.personasLoadSequence;
    this.selectedCursoReloadKey = this.buildCursoReloadKey(this.selectedCurso);

    const availablePromise = companyTag
      ? this.personaService.searchAvailablePersonas({
          companyTag,
          term: this.getEffectiveSearchTerm(this.personaDisponibleSearchTerm),
          maxResults: this.PERSONAS_QUERY_LIMIT,
          targetYear: cursoAssignmentPeriod?.year ?? null,
          targetMonth: cursoAssignmentPeriod?.month ?? null
        })
      : Promise.resolve([]);

    try {
      const fallbackIds = options.reloadEnCurso === false
        ? []
        : Array.from(
            new Set((this.selectedCurso.personasIds || []).map((id) => (id || '').trim()).filter(Boolean))
          );
      const shouldPrefetchByIds = fallbackIds.length > 0 && fallbackIds.length <= 60;
      const [assignedFromQuery, prefetchedFallback] = await Promise.all([
        options.reloadEnCurso === false
          ? Promise.resolve(this.personasEnCurso)
          : this.personaService.getPersonasByCursoId(selectedCursoId, this.PERSONAS_QUERY_LIMIT),
        shouldPrefetchByIds
          ? this.personaService.getPersonasByIds(fallbackIds)
          : Promise.resolve([] as Persona[])
      ]);
      let personasEnCurso = options.reloadEnCurso === false
        ? assignedFromQuery
        : this.mergePersonasContext(assignedFromQuery, prefetchedFallback);

      if (options.reloadEnCurso !== false && !shouldPrefetchByIds && fallbackIds.length > 0) {
        const loadedIds = new Set(personasEnCurso.map((persona) => (persona.id || '').trim()).filter(Boolean));
        const missingIds = fallbackIds.filter((id) => !loadedIds.has(id));
        if (missingIds.length > 0) {
          const fallbackPersonas = await this.personaService.getPersonasByIds(missingIds);
          personasEnCurso = this.mergePersonasContext(personasEnCurso, fallbackPersonas);
        }
      }

      if (
        loadSequence !== this.personasLoadSequence ||
        !this.selectedCurso ||
        this.selectedCurso.idcurso !== selectedCursoId
      ) {
        return;
      }

      this.personasEnCurso = personasEnCurso;
      this.personas = this.mergePersonasContext(personasEnCurso, this.personasDisponibles);
      this.personasFilterRevision += 1;
      this.updateResumenCalificaciones();
      this.selectNextPersonaPendiente();

      const personasDisponibles = await availablePromise;
      if (
        loadSequence !== this.personasLoadSequence ||
        !this.selectedCurso ||
        this.selectedCurso.idcurso !== selectedCursoId
      ) {
        return;
      }

      this.personasDisponibles = personasDisponibles;
      this.personas = this.mergePersonasContext(personasEnCurso, personasDisponibles);
      this.personasFilterRevision += 1;
      this.selectNextPersonaPendiente();

      if (options.autoAssign && personasEnCurso.length === 0) {
        void this.autoAssignPersonasByEmpresaYUbicacion();
      }
    } catch (error) {
      console.error('Error cargando personas del curso:', error);
      this.notificationService.error('No se pudieron cargar las personas del curso');
    }
  }

  loadInstructores() {
    this.instructorService.getInstructores().subscribe({
      next: (instructores) => {
        this.instructores = instructores;
        this.applyCursoFilter();
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
    this.closeArchivoPreview();
    this.closeImagePreview();
    this.deletingArchivoKey = null;
    this.selectedCurso = curso;
    this.selectedCursoReloadKey = this.buildCursoReloadKey(curso);
    this.resultadoFilter = 'all';
    this.updateInstructoresEnCurso();
    void this.loadPersonas({ autoAssign: true, reloadEnCurso: true });
  }

  updatePersonasEnCurso() {
    if (!this.selectedCurso) {
      this.personasEnCurso = [];
      this.personasDisponibles = [];
      this.instructoresEnCurso = [];
      this.updateResumenCalificaciones();
      return;
    }

    const assignedIds = new Set((this.selectedCurso.personasIds || []).filter(Boolean));

    this.personasEnCurso = this.personas.filter((p) => assignedIds.has(p.id || ''));

    this.personasDisponibles = this.personas.filter((p) => {
      const personaId = p.id || '';
      if (!personaId) return false;
      const assignedCursoId = (p.assignedCursoId || '').trim();
      const assignedElsewhere = !!assignedCursoId && assignedCursoId !== this.selectedCurso?.idcurso;
      return !assignedIds.has(personaId) && !assignedElsewhere;
    });

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

  getInstructoresByCurso(curso: Curso): Instructor[] {
    const instructorIds = curso.instructorIds || [];
    if (instructorIds.length === 0) return [];

    return this.instructores.filter((instructor) =>
      instructorIds.includes(instructor.id || '')
    );
  }

  trackByCursoId(index: number, curso: Curso): string {
    return curso.idcurso || curso.nombre || `${index}`;
  }

  trackByPersonaId(index: number, persona: Persona): string {
    return persona.id || persona.curp || persona.email || persona.nombre || `${index}`;
  }

  trackByInstructorId(index: number, instructor: Instructor): string {
    return instructor.id || instructor.nombre || `${index}`;
  }

  trackByString(index: number, value: string): string {
    return value || `${index}`;
  }

  trackByArchivo(index: number, archivo: CursoArchivo): string {
    return `${archivo.storagePath || ''}|${archivo.nombre || 'archivo'}|${archivo.url || ''}|${archivo.tipo || ''}|${index}`;
  }

  getPersonaEntregables(persona: Persona): CursoArchivo[] {
    return ((persona.archivos || []) as CursoArchivo[])
      .filter((archivo) => !!archivo?.url && !!archivo?.nombre);
  }

  openPersonaEntregable(file: CursoArchivo): void {
    this.openArchivo(file);
  }

  onInstructorImgError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.onerror = null;
    img.src = this.defaultInstructorImg;
  }

  openImagePreview(url?: string | null, name?: string | null): void {
    const resolvedUrl = (url || '').trim();
    if (!resolvedUrl) {
      return;
    }

    this.imagePreviewUrl = resolvedUrl;
    this.imagePreviewName = (name || 'Imagen').trim() || 'Imagen';
    this.showImagePreview = true;
  }

  closeImagePreview(): void {
    this.showImagePreview = false;
    this.imagePreviewUrl = '';
    this.imagePreviewName = '';
  }

  onImagePreviewError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (!img) return;

    if (img.src !== this.defaultInstructorImg) {
      img.onerror = null;
      img.src = this.defaultInstructorImg;
      return;
    }

    this.closeImagePreview();
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
    if (this.savingCurso) return;

    if (
      this.newCurso.nombre &&
      this.newCurso.descripcion &&
      this.newCurso.dia &&
      this.newCurso.nom_representante &&
      this.newCurso.num_represnetantes &&
      this.newCurso.companyTag &&
      this.newCurso.companyTag.trim()
    ) {
      try {
        this.savingCurso = true;
        await this.cursoService.addCurso({
          ...(this.newCurso as Curso),
          num_represnetantes: sanitizePhoneInput(this.newCurso.num_represnetantes),
          companyTag: this.normalizeCompanyTag(this.newCurso.companyTag),
          personasIds: []
        });
        this.resetCursoForm();
        this.notificationService.success('Curso agregado exitosamente');
      } catch (error) {
        console.error('Error agregando curso:', error);
        this.notificationService.error('Error al agregar curso');
      } finally {
        this.savingCurso = false;
      }
    } else {
      this.notificationService.warning('Completa todos los campos, incluyendo etiqueta de empresa');
    }
  }

  startEditCurso(curso: Curso) {
    if (!this.canManageCurso()) return;

    this.editingCursoId = curso.idcurso || null;
    this.editingCurso = {
      ...curso,
      dia: curso.dia ?? curso.Fecha_inicio ?? curso.Fecha_fin,
      num_represnetantes: sanitizePhoneInput(curso.num_represnetantes),
      archivos: (curso.archivos || []).map((archivo) => ({ ...archivo }))
    };
    this.closeArchivoPreview();
    this.showCursoForm = true;
  }

  async updateCurso() {
    if (!this.canManageCurso()) return;
    if (this.savingCurso) return;

    if (this.editingCursoId) {
      if (!this.editingCurso.companyTag || !this.editingCurso.companyTag.trim()) {
        this.notificationService.warning('La etiqueta de empresa es requerida');
        return;
      }

      if (!this.editingCurso.dia) {
        this.notificationService.warning('El dia del curso es requerido');
        return;
      }

      try {
        this.savingCurso = true;
        await this.cursoService.updateCurso(this.editingCursoId, {
          ...this.editingCurso,
          num_represnetantes: sanitizePhoneInput(this.editingCurso.num_represnetantes),
          companyTag: this.normalizeCompanyTag(this.editingCurso.companyTag)
        } as Curso);
        this.resetCursoForm();
        this.notificationService.success('Curso actualizado exitosamente');
      } catch (error) {
        console.error('Error actualizando curso:', error);
        this.notificationService.error('Error al actualizar curso');
      } finally {
        this.savingCurso = false;
      }
    }
  }

  async deleteCurso(id: string | undefined) {
    if (!this.canManageCurso()) return;
    if (!id || this.deletingCursoId === id) return;

    const curso = this.allCursos.find((item) => item.idcurso === id) || this.selectedCurso;
    const cursoNombre = (curso?.nombre || 'Curso sin nombre').trim();
    const personasCount = Array.from(new Set((curso?.personasIds || []).filter(Boolean))).length;
    const instructoresCount = Array.from(new Set((curso?.instructorIds || []).filter(Boolean))).length;
    const archivosCount = (curso?.archivos || []).length;

    const confirmed = confirm(
      [
        `Estas seguro de eliminar el curso "${cursoNombre}"?`,
        '',
        `Personas asignadas: ${personasCount}`,
        `Instructores asignados: ${instructoresCount}`,
        `Archivos del curso: ${archivosCount}`,
        '',
        'Esta accion no se puede deshacer.'
      ].join('\n')
    );
    if (!confirmed) return;

    try {
      this.deletingCursoId = id;
      await this.cursoService.deleteCurso(id);
      this.selectedCurso = null;
      this.selectedCursoReloadKey = '';
      this.personasEnCurso = [];
      this.instructoresEnCurso = [];
      this.allCursos = this.allCursos.filter((cursoItem) => cursoItem.idcurso !== id);
      this.applyCursoFilter();
      this.notificationService.success('Curso eliminado exitosamente');
    } catch (error) {
      console.error('Error eliminando curso:', error);
      this.notificationService.error('Error al eliminar curso');
    } finally {
      this.deletingCursoId = null;
    }
  }

  resetCursoForm() {
    this.closeArchivoPreview();
    this.revokeObjectUrls(this.newCurso.archivos as CursoArchivo[] | undefined);
    this.revokeObjectUrls(this.editingCurso.archivos as CursoArchivo[] | undefined);

    this.newCurso = {
      nombre: '',
      descripcion: '',
      dia: undefined,
      nom_representante: '',
      num_represnetantes: '',
      companyTag: '',
      archivos: []
    };

    this.editingCurso = {
      nombre: '',
      descripcion: '',
      dia: undefined,
      nom_representante: '',
      num_represnetantes: '',
      companyTag: '',
      archivos: []
    };

    this.editingCursoId = null;
    this.showCursoForm = false;
    this.savingCurso = false;
    this.deletingArchivoKey = null;
    this.loadingArchivos = false;
  }

  async addPersonaToCurso(personaId: string | null) {
    if (!this.selectedCurso || !personaId) return;
    if (!this.canManagePersonas()) return;
    if (this.isPersonaAsignada(personaId)) {
      this.notificationService.warning('Esta persona ya esta asignada al curso');
      this.selectNextPersonaPendiente();
      return;
    }

    try {
      const cursoId = this.selectedCurso.idcurso || '';
      await this.cursoService.addPersonaToCurso(cursoId, personaId);
      const updatedPersonasIds = Array.from(new Set([...(this.selectedCurso.personasIds || []), personaId]));
      this.updateSelectedCursoPersonasIds(updatedPersonasIds);
      await this.loadPersonas({ autoAssign: false, reloadEnCurso: true });
      this.ensurePersonaVisibleInCursoList(personaId);
      this.selectNextPersonaPendiente();
      this.notificationService.success('Persona asignada al curso');
    } catch (error) {
      console.error('Error agregando persona al curso:', error);
      const errorMessage = error instanceof Error ? error.message.trim() : '';
      this.notificationService.error(errorMessage || 'Error al agregar persona al curso');
    }
  }

  async removePersonaFromCurso(personaId: string | undefined) {
    if (!this.selectedCurso || !personaId) return;
    if (!this.canManagePersonas()) return;
    if (this.removingPersonasIds[personaId]) return;

    const cursoId = this.selectedCurso.idcurso || '';
    const selectedCursoIdAtStart = cursoId;
    const previousPersonasIds = [...(this.selectedCurso.personasIds || [])];
    const previousPersonasEnCurso = [...this.personasEnCurso];
    const previousPersonasDisponibles = [...this.personasDisponibles];
    const previousPersonas = [...this.personas];
    const previousSelectedPersonaToAdd = this.selectedPersonaToAdd;

    const personaRemovida = this.personasEnCurso.find((persona) => persona.id === personaId);
    const updatedPersonasIds = previousPersonasIds.filter((id) => id !== personaId);

    this.removingPersonasIds[personaId] = true;

    // Optimistic UI: remove immediately from the selected course list.
    this.updateSelectedCursoPersonasIds(updatedPersonasIds);
    this.personasEnCurso = previousPersonasEnCurso.filter((persona) => persona.id !== personaId);

    if (personaRemovida) {
      const updatedCursoIds = (personaRemovida.cursoIds || [])
        .map((id) => (id || '').trim())
        .filter((id) => id && id !== cursoId);
      const updatedAssignedCursoId = updatedCursoIds[0] || '';
      const updatedPersona: Persona = {
        ...personaRemovida,
        cursoIds: updatedCursoIds,
        assignedCursoId: updatedAssignedCursoId,
        assignmentStatus: updatedAssignedCursoId ? 'assigned' : 'available'
      };

      const alreadyInDisponibles = previousPersonasDisponibles.some((persona) => persona.id === personaId);
      this.personasDisponibles = alreadyInDisponibles
        ? previousPersonasDisponibles.map((persona) => (persona.id === personaId ? updatedPersona : persona))
        : [...previousPersonasDisponibles, updatedPersona];
    }

    this.personas = this.mergePersonasContext(this.personasEnCurso, this.personasDisponibles);
    this.personasFilterRevision += 1;
    this.updateResumenCalificaciones();
    this.selectNextPersonaPendiente();

    try {
      await this.cursoService.removePersonaFromCurso(cursoId, personaId);
      this.notificationService.info('Persona removida del curso');

      // Lightweight refresh: keep current assigned list and only sync available candidates.
      void this.loadPersonas({ autoAssign: false, reloadEnCurso: false });
    } catch (error) {
      if (this.selectedCurso?.idcurso === selectedCursoIdAtStart) {
        this.updateSelectedCursoPersonasIds(previousPersonasIds);
        this.personasEnCurso = previousPersonasEnCurso;
        this.personasDisponibles = previousPersonasDisponibles;
        this.personas = previousPersonas;
        this.selectedPersonaToAdd = previousSelectedPersonaToAdd;
        this.personasFilterRevision += 1;
        this.updateResumenCalificaciones();
      }

      console.error('Error removiendo persona del curso:', error);
      this.notificationService.error('Error al remover persona del curso');
    } finally {
      delete this.removingPersonasIds[personaId];
    }
  }

  async autoAssignPersonasByEmpresaYUbicacion(): Promise<void> {
    if (!this.selectedCurso?.idcurso || !this.canManagePersonas() || this.autoAssigningPersonas) return;

    const companyTag = this.normalizeCompanyTag(this.selectedCurso.companyTag);
    const locationTerm = this.getCursoAutoAssignLocation(this.selectedCurso);
    const cursoAssignmentPeriod = this.resolveCursoAssignmentPeriod(this.selectedCurso);

    if (!companyTag || !locationTerm) {
      return;
    }

    const matchingCursos = this.getAutoAssignMatchingCursos(this.selectedCurso, cursoAssignmentPeriod);
    if (matchingCursos.length > 1) {
      this.notificationService.info(
        `Autoasignacion detenida: se detectaron ${matchingCursos.length} cursos para la misma empresa/ubicacion y periodo. Usa asignacion multiple desde Personas.`
      );
      return;
    }

    const candidatos = await this.personaService.findAutoAssignablePersonas({
      companyTag,
      locationTerm,
      maxResults: this.PERSONAS_QUERY_LIMIT,
      targetYear: cursoAssignmentPeriod?.year ?? null,
      targetMonth: cursoAssignmentPeriod?.month ?? null
    });
    const nuevosIds = candidatos
      .map((persona) => (persona.id || '').trim())
      .filter(Boolean);

    if (nuevosIds.length === 0) {
      return;
    }

    const cursoId = this.selectedCurso.idcurso;

    try {
      this.autoAssigningPersonas = true;
      const result = await this.cursoService.addPersonasToCurso(cursoId, nuevosIds);
      await this.loadPersonas({ autoAssign: false, reloadEnCurso: true });
      this.selectNextPersonaPendiente();

      if (result.added > 0) {
        this.notificationService.success(
          `Autoasignacion completada: ${result.added} persona(s) asignadas por empresa y ubicacion`
        );
      } else if (result.skipped > 0) {
        this.notificationService.info(
          `Autoasignacion sin cambios: ${result.skipped} persona(s) estaban bloqueadas por asignacion activa`
        );
      }

      if (result.errors > 0) {
        this.notificationService.warning(
          `Autoasignacion parcial: ${result.errors} persona(s) no se pudieron asignar`
        );
      }
    } catch (error) {
      console.error('Error en autoasignacion de personas:', error);
      this.notificationService.error('No se pudo completar la autoasignacion automatica');
    } finally {
      this.autoAssigningPersonas = false;
    }
  }

  async onFilesSelected(event: Event): Promise<void> {
    if (!this.canManageCursoFiles()) return;

    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    this.loadingArchivos = true;

    try {
      const archivos = await this.readPdfFilesFromInput(input);
      if (archivos.length === 0) return;

      const target = this.editingCursoId ? this.editingCurso : this.newCurso;
      target.archivos = [
        ...(target.archivos || []),
        ...archivos
      ];

      this.notificationService.success(
        `Se agregaron ${archivos.length} archivo(s) PDF. Puedes seguir agregando mas.`
      );
    } catch (error) {
      console.error('Error leyendo archivos del curso:', error);
      this.notificationService.error('No se pudieron leer uno o mas archivos');
    } finally {
      this.loadingArchivos = false;
      input.value = '';
    }
  }

  async onFilesSelectedForSelectedCurso(event: Event): Promise<void> {
    if (!this.canManageCursoFiles() || !this.selectedCurso?.idcurso) return;

    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const cursoId = this.selectedCurso.idcurso;
    this.loadingArchivos = true;

    try {
      const nuevosArchivos = await this.readPdfFilesFromInput(input);
      if (nuevosArchivos.length === 0) return;

      const archivosActualizados = [
        ...(this.selectedCurso.archivos || []),
        ...nuevosArchivos
      ];

      await this.cursoService.updateCurso(cursoId, { archivos: archivosActualizados });

      this.selectedCurso = {
        ...this.selectedCurso,
        archivos: [...archivosActualizados]
      };
      this.allCursos = this.allCursos.map((curso) =>
        curso.idcurso === cursoId
          ? { ...curso, archivos: [...archivosActualizados] }
          : curso
      );
      this.applyCursoFilter();

      if (this.editingCursoId === cursoId) {
        this.editingCurso = {
          ...this.editingCurso,
          archivos: archivosActualizados.map((archivo) => ({ ...archivo }))
        };
      }

      this.notificationService.success(
        `Se agregaron ${nuevosArchivos.length} archivo(s) PDF al curso seleccionado.`
      );
    } catch (error) {
      console.error('Error agregando archivos al curso seleccionado:', error);
      this.notificationService.error('No se pudieron agregar los archivos al curso');
    } finally {
      this.loadingArchivos = false;
      input.value = '';
    }
  }

  private async readPdfFilesFromInput(input: HTMLInputElement): Promise<CursoArchivo[]> {
    const files = input.files;
    if (!files?.length) return [];

    const selectedFiles = Array.from(files);
    const validFiles = selectedFiles.filter((file) => this.isAllowedAttachmentFile(file));
    const rejectedCount = selectedFiles.length - validFiles.length;

    if (rejectedCount > 0) {
      this.notificationService.warning('Solo se permiten archivos PDF. Se omitieron archivos no compatibles.');
    }

    if (validFiles.length === 0) {
      return [];
    }

    return await Promise.all(validFiles.map(async (file) => ({
      nombre: file.name,
      url: await this.readFileAsDataUrl(file),
      tipo: file.type || this.getFileTypeFromName(file.name),
      size: file.size,
      uploadedAt: new Date(),
      file
    })));
  }

  getCurrentArchivos(): CursoArchivo[] {
    return (this.editingCursoId ? this.editingCurso.archivos : this.newCurso.archivos) || [];
  }

  removeArchivo(index: number): void {
    if (!this.canManageCursoFiles()) return;

    const target = this.editingCursoId ? this.editingCurso : this.newCurso;
    const archivos = [...(target.archivos || [])];
    if (index < 0 || index >= archivos.length) return;

    const archivoObjetivo = archivos[index];
    const archivoNombre = (archivoObjetivo?.nombre || 'archivo').trim();
    const remainingCount = Math.max(archivos.length - 1, 0);
    const confirmed = confirm(
      [
        `Estas seguro de eliminar el archivo "${archivoNombre}"?`,
        '',
        `Archivos restantes despues de eliminar: ${remainingCount}`
      ].join('\n')
    );
    if (!confirmed) return;

    const [removed] = archivos.splice(index, 1);

    if (removed?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(removed.url);
    }

    target.archivos = archivos;
  }

  getArchivoDeleteKey(file: CursoArchivo, index: number): string {
    return `${file.storagePath || file.url || file.nombre || 'archivo'}|${index}`;
  }

  async removeArchivoFromSelectedCurso(file: CursoArchivo, index: number): Promise<void> {
    if (!this.canManageCursoFiles() || !this.selectedCurso?.idcurso) return;

    const cursoId = this.selectedCurso.idcurso;
    const archivosActuales = [...(this.selectedCurso.archivos || [])];
    if (index < 0 || index >= archivosActuales.length) return;

    const archivoObjetivo = archivosActuales[index];
    const archivoNombre = archivoObjetivo?.nombre || file?.nombre || 'archivo';
    const deleteKey = this.getArchivoDeleteKey(archivoObjetivo, index);
    if (this.deletingArchivoKey === deleteKey) return;

    const remainingCount = Math.max(archivosActuales.length - 1, 0);
    const cursoNombre = (this.selectedCurso.nombre || 'Curso sin nombre').trim();
    const confirmed = confirm(
      [
        `Estas seguro de eliminar el archivo "${archivoNombre}" del curso "${cursoNombre}"?`,
        '',
        `Archivos actuales: ${archivosActuales.length}`,
        `Archivos despues de eliminar: ${remainingCount}`
      ].join('\n')
    );
    if (!confirmed) {
      return;
    }

    try {
      this.deletingArchivoKey = deleteKey;
      const archivosActualizados = archivosActuales.filter((_, i) => i !== index);

      await this.cursoService.updateCurso(cursoId, { archivos: archivosActualizados });

      if (this.previewFile?.url && archivoObjetivo?.url && this.previewFile.url === archivoObjetivo.url) {
        this.closeArchivoPreview();
      }

      this.allCursos = this.allCursos.map((curso) =>
        curso.idcurso === cursoId
          ? { ...curso, archivos: [...archivosActualizados] }
          : curso
      );
      this.applyCursoFilter();

      if (this.editingCursoId === cursoId) {
        this.editingCurso = {
          ...this.editingCurso,
          archivos: archivosActualizados.map((archivo) => ({ ...archivo }))
        };
      }

      this.notificationService.success('Archivo eliminado del curso');
    } catch (error) {
      console.error('Error eliminando archivo del curso:', error);
      this.notificationService.error('No se pudo eliminar el archivo');
    } finally {
      this.deletingArchivoKey = null;
    }
  }

  canPreviewArchivo(file: CursoArchivo): boolean {
    const previewType = this.getPreviewType(file);
    return this.isSafeAttachmentUrl(file.url || '', previewType);
  }

  getArchivoActionLabel(file: CursoArchivo): string {
    const previewType = this.getPreviewType(file);
    if (previewType === 'unsupported') return 'Abrir';
    if (previewType === 'text' && !this.canLoadTextPreview(file.url || '')) return 'Abrir';
    return 'Ver';
  }

  getArchivoPreviewTooltip(file: CursoArchivo): string {
    if (!this.canPreviewArchivo(file)) {
      return this.getArchivoPreviewError(file);
    }

    const previewType = this.getPreviewType(file);
    if (previewType === 'unsupported') {
      return 'Abrir archivo';
    }

    if (previewType === 'text' && !this.canLoadTextPreview(file.url || '')) {
      return 'Abrir archivo';
    }

    return 'Ver archivo';
  }

  openArchivo(file: CursoArchivo): void {
    if (!file?.url) return;

    this.previewFile = file;
    this.previewType = this.getPreviewType(file);
    this.previewText = '';
    this.previewResourceUrl = null;
    this.previewOpenUrl = null;
    this.previewError = '';

    const previewType = this.getPreviewType(file);
    const safeAttachment = this.isSafeAttachmentUrl(file.url || '', previewType);
    this.previewOpenUrl = safeAttachment ? file.url : null;

    if (!safeAttachment) {
      this.previewType = 'unsupported';
      this.previewError = this.getArchivoPreviewError(file);
      this.showFilePreview = true;
      return;
    }

    if (previewType === 'pdf') {
      this.previewResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(file.url);
      this.showFilePreview = true;
      return;
    }

    if (previewType === 'text') {
      if (!this.canLoadTextPreview(file.url || '')) {
        this.previewType = 'unsupported';
        this.previewError = 'La vista previa de texto no esta disponible para este archivo. Usa Abrir.';
        this.showFilePreview = true;
        return;
      }

      this.loadTextPreview(file);
    }

    this.previewType = previewType;
    this.showFilePreview = true;
  }

  onPreviewImageError(): void {
    this.previewType = 'unsupported';
    this.previewError = 'No se pudo cargar la imagen de este archivo.';
  }

  closeArchivoPreview(): void {
    this.showFilePreview = false;
    this.previewFile = null;
    this.previewType = 'unsupported';
    this.previewText = '';
    this.previewResourceUrl = null;
    this.previewOpenUrl = null;
    this.previewError = '';
  }

  formatArchivoSize(value: unknown): string {
    const size = Number(value);
    if (!Number.isFinite(size) || size <= 0) return '-';
    if (size < 1024) return `${size} B`;

    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;

    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
  }

  private getPreviewType(file: CursoArchivo): FilePreviewType {
    const tipo = (file.tipo || '').toLowerCase();
    const nombre = (file.nombre || '').toLowerCase();

    if (tipo.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(nombre)) {
      return 'image';
    }

    if (tipo === 'application/pdf' || nombre.endsWith('.pdf')) {
      return 'pdf';
    }

    if (
      tipo.startsWith('text/') ||
      tipo === 'application/json' ||
      tipo === 'application/xml' ||
      /\.(txt|csv|json|xml|md)$/i.test(nombre)
    ) {
      return 'text';
    }

    return 'unsupported';
  }

  private async loadTextPreview(file: CursoArchivo): Promise<void> {
    try {
      if (!this.canLoadTextPreview(file.url || '')) {
        this.previewText = 'La vista previa de texto no esta disponible para este archivo. Usa Abrir.';
        return;
      }

      const response = await fetch(file.url || '');
      this.previewText = await response.text();
    } catch (error) {
      console.error('Error cargando vista previa de texto:', error);
      this.previewText = 'No se pudo mostrar la vista previa de este archivo.';
    }
  }

  private canLoadTextPreview(url: string): boolean {
    const normalizedUrl = this.normalizeTextField(url);
    if (!normalizedUrl) return false;

    const protocol = this.getUrlProtocol(normalizedUrl);
    if (protocol === 'data:') {
      return true;
    }

    if (protocol === 'http:' || protocol === 'https:') {
      return this.isTrustedHttpPreviewUrl(normalizedUrl);
    }

    return false;
  }

  private getArchivoPreviewError(file: CursoArchivo): string {
    const protocol = this.getUrlProtocol(file.url || '');
    const previewType = this.getPreviewType(file);

    if (protocol === 'javascript:' || protocol === 'file:' || protocol === 'vbscript:' || protocol === 'blob:') {
      return 'La URL de este archivo no es segura y fue bloqueada.';
    }

    if ((protocol === 'http:' || protocol === 'https:') && !this.isTrustedHttpPreviewUrl(file.url || '')) {
      return 'La URL de este archivo apunta a otro origen y fue bloqueada.';
    }

    if (!previewType || previewType === 'unsupported') {
      return 'No hay vista previa integrada para este tipo de archivo. Usa Abrir para verlo.';
    }

    return 'No se pudo abrir este archivo.';
  }

  private normalizeTextField(value: unknown): string {
    return String(value ?? '').trim();
  }

  private getUrlProtocol(url: string): string {
    const normalized = this.normalizeTextField(url);
    if (!normalized) return '';

    try {
      return new URL(normalized, window.location.origin).protocol.toLowerCase();
    } catch {
      return '';
    }
  }

  private isTrustedHttpPreviewUrl(url: string): boolean {
    const normalized = this.normalizeTextField(url);
    if (!normalized) return false;

    try {
      const parsed = new URL(normalized, window.location.origin);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
      }

      if (parsed.origin === window.location.origin) {
        return true;
      }

      return this.isFirebaseStorageUrl(parsed);
    } catch {
      return false;
    }
  }

  private isFirebaseStorageUrl(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    return (
      host === 'firebasestorage.googleapis.com' ||
      host === 'storage.googleapis.com' ||
      host === 'firebasestorage.app' ||
      host.endsWith('.firebasestorage.app')
    );
  }

  private isSafeAttachmentUrl(url: string, previewType?: FilePreviewType): boolean {
    const normalizedUrl = this.normalizeTextField(url);
    if (!normalizedUrl) return false;

    const protocol = this.getUrlProtocol(normalizedUrl);
    if (!protocol) return false;

    if (protocol === 'javascript:' || protocol === 'file:' || protocol === 'vbscript:' || protocol === 'blob:') {
      return false;
    }

    if (protocol === 'http:' || protocol === 'https:') {
      return this.isTrustedHttpPreviewUrl(normalizedUrl);
    }

    if (protocol === 'data:') {
      if (!previewType) {
        return false;
      }

      return this.isAllowedDataUrlForPreview(normalizedUrl, previewType);
    }

    return false;
  }

  private getDataUrlMime(url: string): string {
    const normalized = this.normalizeTextField(url);
    if (!normalized.toLowerCase().startsWith('data:')) {
      return '';
    }

    const commaIndex = normalized.indexOf(',');
    const header = commaIndex >= 0 ? normalized.slice(5, commaIndex) : normalized.slice(5);
    const mime = header.split(';')[0].trim().toLowerCase();
    return mime;
  }

  private isAllowedDataUrlForPreview(url: string, previewType: FilePreviewType): boolean {
    const mime = this.getDataUrlMime(url);
    if (!mime) return false;

    if (previewType === 'image') {
      return mime.startsWith('image/') && mime !== 'image/svg+xml';
    }

    if (previewType === 'pdf') {
      return mime === 'application/pdf';
    }

    if (previewType === 'text') {
      return mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml';
    }

    return false;
  }

  private async readFileAsDataUrl(file: File): Promise<string> {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          resolve(result);
          return;
        }

        reject(new Error('No se pudo leer el archivo'));
      };

      reader.onerror = () => {
        reject(reader.error || new Error('No se pudo leer el archivo'));
      };

      reader.readAsDataURL(file);
    });
  }

  private getFileTypeFromName(fileName: string): string {
    const name = (fileName || '').toLowerCase();
    if (name.endsWith('.pdf')) return 'application/pdf';
    if (name.endsWith('.txt')) return 'text/plain';
    if (name.endsWith('.csv')) return 'text/csv';
    if (name.endsWith('.json')) return 'application/json';
    if (name.endsWith('.xml')) return 'application/xml';
    if (name.endsWith('.md')) return 'text/markdown';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.gif')) return 'image/gif';
    if (name.endsWith('.webp')) return 'image/webp';
    return 'application/octet-stream';
  }

  private isAllowedAttachmentFile(file: File): boolean {
    return (
      (file.type || '').toLowerCase() === 'application/pdf' ||
      this.getFileTypeFromName(file.name) === 'application/pdf'
    );
  }

  private revokeObjectUrls(archivos: CursoArchivo[] | undefined): void {
    if (!archivos?.length) return;

    for (const archivo of archivos) {
      if (archivo.url?.startsWith('blob:')) {
        URL.revokeObjectURL(archivo.url);
      }
    }
  }

  async exportCursoReportExcel() {
    if (!this.canExportCursoReport() || this.exportingCursoReport) return;

    try {
      this.exportingCursoReport = true;
      await this.reportService.exportToExcel(this.buildCursoReportData());
      this.notificationService.success('Reporte en Excel generado');
    } catch (error) {
      console.error('Error exportando reporte por curso (Excel):', error);
      this.notificationService.error('Error al exportar reporte por curso en Excel');
    } finally {
      this.exportingCursoReport = false;
    }
  }

  async exportCursoReportPDF() {
    if (!this.canExportCursoReport() || this.exportingCursoReport) return;

    try {
      this.exportingCursoReport = true;
      await this.reportService.exportToPDF(this.buildCursoReportData());
      this.notificationService.success('Reporte en PDF generado');
    } catch (error) {
      console.error('Error exportando reporte por curso (PDF):', error);
      this.notificationService.error('Error al exportar reporte por curso en PDF');
    } finally {
      this.exportingCursoReport = false;
    }
  }

  async exportCompanyCursosReportPDF(): Promise<void> {
    if (!this.canExportCompanyGlobalReports || this.exportingCompanyCoursesReport) return;

    const cursos = this.getCompanyCursosForGlobalReport();
    if (cursos.length === 0) {
      this.notificationService.info('No hay cursos visibles para exportar.');
      return;
    }

    try {
      this.exportingCompanyCoursesReport = true;
      const personas = await this.getCompanyPersonasForGlobalReport(cursos);
      if (personas.length === 0) {
        this.notificationService.info('No hay personas asignadas para exportar en PDF.');
        return;
      }

      const reportData: ReportData = {
        title: this.getCompanyPersonasReportTitle(),
        generatedAt: new Date(),
        totalPersonas: personas.length,
        personas,
        empresa: this.normalizeCompanyTag(this.currentUser?.companyTag),
        lugar: this.getReportLocationLabel(personas),
        instructorName: 'Todos',
        showCursosAsignados: false
      };

      await this.reportService.exportToPDF(reportData);
      this.notificationService.success('Reporte global de personas generado');
    } catch (error) {
      console.error('Error exportando reporte global de personas (PDF):', error);
      this.notificationService.error('Error al exportar el reporte global de personas');
    } finally {
      this.exportingCompanyCoursesReport = false;
    }
  }

  async exportCompanyPersonasExcel(): Promise<void> {
    if (!this.canExportCompanyGlobalReports || this.exportingCompanyPersonasExcelReport) return;

    const cursos = this.getCompanyCursosForGlobalReport();
    if (cursos.length === 0) {
      this.notificationService.info('No hay cursos visibles para exportar.');
      return;
    }

    try {
      this.exportingCompanyPersonasExcelReport = true;
      const personas = await this.getCompanyPersonasForGlobalReport(cursos);
      if (personas.length === 0) {
        this.notificationService.info('No hay personas asignadas para exportar en Excel.');
        return;
      }

      const reportData: ReportData = {
        title: this.getCompanyPersonasExcelReportTitle(),
        generatedAt: new Date(),
        totalPersonas: personas.length,
        personas,
        empresa: this.normalizeCompanyTag(this.currentUser?.companyTag),
        lugar: 'Todas las ciudades',
        instructorName: 'Todos',
        showCursosAsignados: false
      };

      await this.reportService.exportToExcel(reportData);
      this.notificationService.success('Excel global de personas generado');
    } catch (error) {
      console.error('Error exportando personas globales (Excel):', error);
      this.notificationService.error('Error al exportar Excel global de personas');
    } finally {
      this.exportingCompanyPersonasExcelReport = false;
    }
  }

  async exportCompanyEntregablesPDF(): Promise<void> {
    if (!this.canExportCompanyGlobalReports || this.exportingCompanyEntregablesReport) return;

    const cursos = this.getCompanyCursosForGlobalReport();
    if (cursos.length === 0) {
      this.notificationService.info('No hay cursos visibles para exportar entregables.');
      return;
    }

    try {
      this.exportingCompanyEntregablesReport = true;
      const rows = await this.buildCompanyEntregablesRows(cursos);

      if (rows.length === 0) {
        this.notificationService.info('No se encontraron entregables para los cursos visibles.');
        return;
      }

      await this.reportService.exportCursosEntregablesToPDF(rows, {
        title: this.getCompanyEntregablesReportTitle(),
        companyTag: this.currentUser?.companyTag || '',
        totalCursos: cursos.length
      });
      this.notificationService.success('PDF de entregables generado');
    } catch (error) {
      console.error('Error exportando entregables globales (PDF):', error);
      this.notificationService.error('Error al exportar PDF de entregables');
    } finally {
      this.exportingCompanyEntregablesReport = false;
    }
  }

  private getCompanyCursosForGlobalReport(): Curso[] {
    return [...this.cursos].sort((a, b) => this.compareCursos(a, b));
  }

  private getCompanyPersonasReportTitle(): string {
    const tag = this.normalizeCompanyTag(this.currentUser?.companyTag);
    return tag
      ? `Reporte Global de Personas - Empresa: ${tag.toUpperCase()}`
      : 'Reporte Global de Personas';
  }

  private getCompanyPersonasExcelReportTitle(): string {
    const tag = this.normalizeCompanyTag(this.currentUser?.companyTag);
    return tag
      ? `Reporte Global de Personas por Ciudad - Empresa: ${tag.toUpperCase()}`
      : 'Reporte Global de Personas por Ciudad';
  }

  private getCompanyEntregablesReportTitle(): string {
    const tag = this.normalizeCompanyTag(this.currentUser?.companyTag);
    return tag
      ? `Entregables Globales - Empresa: ${tag.toUpperCase()}`
      : 'Entregables Globales por Curso';
  }

  private async buildCompanyEntregablesRows(cursos: Curso[]): Promise<CursoEntregableReportRow[]> {
    const personaIds = Array.from(
      new Set(
        cursos.flatMap((curso) =>
          (curso.personasIds || [])
            .map((id) => (id || '').trim())
            .filter(Boolean)
        )
      )
    );
    const personas = personaIds.length > 0
      ? await this.personaService.getPersonasByIds(personaIds)
      : [];
    const personasById = new Map(
      personas
        .map((persona) => [String(persona.id || '').trim(), persona] as [string, Persona])
        .filter(([id]) => !!id)
    );

    const rows: CursoEntregableReportRow[] = [];

    for (const curso of cursos) {
      const cursoNombre = (curso.nombre || '').trim() || 'Curso sin nombre';
      const cursoFecha = curso.dia ?? curso.Fecha_inicio ?? curso.Fecha_fin;
      const companyTag = this.normalizeCompanyTag(curso.companyTag);

      for (const archivo of (curso.archivos || []) as CursoArchivo[]) {
        if (!archivo?.nombre || !archivo?.url) continue;

        rows.push({
          cursoNombre,
          cursoFecha,
          companyTag,
          origen: 'curso',
          archivoNombre: archivo.nombre,
          archivoTipo: archivo.tipo || this.getFileTypeFromName(archivo.nombre),
          archivoUrl: archivo.url
        });
      }

      const cursoPersonaIds = Array.from(
        new Set((curso.personasIds || []).map((id) => (id || '').trim()).filter(Boolean))
      );
      for (const personaId of cursoPersonaIds) {
        const persona = personasById.get(personaId);
        if (!persona) continue;

        for (const archivo of this.getPersonaEntregables(persona)) {
          rows.push({
            cursoNombre,
            cursoFecha,
            companyTag,
            origen: 'persona',
            personaNombre: persona.nombre || '',
            personaEmail: persona.email || '',
            archivoNombre: archivo.nombre,
            archivoTipo: archivo.tipo || this.getFileTypeFromName(archivo.nombre),
            archivoUrl: archivo.url
          });
        }
      }
    }

    return rows;
  }

  private async getCompanyPersonasForGlobalReport(cursos: Curso[]): Promise<Persona[]> {
    const personaIds = Array.from(
      new Set(
        cursos.flatMap((curso) =>
          (curso.personasIds || [])
            .map((id) => (id || '').trim())
            .filter(Boolean)
        )
      )
    );

    if (personaIds.length === 0) {
      return [];
    }

    const personas = await this.personaService.getPersonasByIds(personaIds);
    return [...personas].sort((a, b) => this.comparePersonas(a, b));
  }

  private buildCursoReportData(): ReportData {
    const cursoNombre = this.selectedCurso?.nombre || 'Curso sin nombre';
    const instructorName = this.instructoresEnCurso.map((item) => item.nombre).join(', ');
    const personas = this.personasEnCurso;
    const lugar = this.getReportLocationLabel(personas);

    return {
      title: `Reporte de Personas - Curso: ${cursoNombre}`,
      generatedAt: new Date(),
      totalPersonas: personas.length,
      personas,
      empresa: this.selectedCurso?.companyTag || '',
      lugar,
      instructorName,
      showCursosAsignados: false
    };
  }

  private getReportLocationLabel(personas: Persona[]): string {
    const ubicaciones = Array.from(
      new Set(personas.map((persona) => (persona.lugar || '').trim()).filter(Boolean))
    );

    if (ubicaciones.length === 1) {
      return ubicaciones[0];
    }

    if (ubicaciones.length > 1) {
      return `Multiples ubicaciones (${ubicaciones.length})`;
    }

    return '';
  }

  onCalificacionChange(persona: Persona, field: 'clfPractica' | 'clfTeorica', value: unknown) {
    const normalized = this.normalizeScoreForEdit(value);
    persona[field] = normalized === null ? undefined : normalized;
    this.personasFilterRevision += 1;
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
      this.personasFilterRevision += 1;
      this.updateResumenCalificaciones();
    } catch (error) {
      console.error('Error guardando calificaciones:', error);
      this.notificationService.error('No se pudieron guardar las calificaciones');
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
    return sanitizeScoreInput(value);
  }

  private applyCursoFilter() {
    if (!this.currentUser) {
      this.cursos = this.allCursos;
      this.syncSelectedCurso();
      return;
    }

    if (this.currentUser.role === 'admin') {
      this.cursos = this.allCursos;
      this.syncSelectedCurso();
      return;
    }

    if (this.currentUser.role === 'director') {
      this.cursos = this.allCursos;
      this.syncSelectedCurso();
      return;
    }

    if (this.currentUser.role === 'company') {
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
      return;
    }

    if (this.currentUser.role === 'instructor') {
      const assignedByUser = new Set((this.currentUser.assignedCourseIds || []).filter(Boolean));
      const instructorIds = this.getInstructorIdsForCurrentUser();

      this.cursos = this.allCursos.filter((curso) => {
        const byUserAssignment = !!curso.idcurso && assignedByUser.has(curso.idcurso);
        const byInstructorProfile = (curso.instructorIds || []).some((id) => instructorIds.has(id));
        return (byUserAssignment || byInstructorProfile) && !this.isCursoCaducadoParaInstructor(curso);
      });
      this.syncSelectedCurso();
      return;
    }

    this.cursos = [];
    this.syncSelectedCurso();
  }

  private syncSelectedCurso() {
    if (!this.selectedCurso) return;

    const selectedId = this.selectedCurso.idcurso;
    const updatedSelection = this.cursos.find((curso) => curso.idcurso === selectedId) || null;
    this.selectedCurso = updatedSelection;

    if (!this.selectedCurso) {
      this.selectedCursoReloadKey = '';
      this.personasEnCurso = [];
      this.personasDisponibles = [];
      this.personas = [];
      this.instructoresEnCurso = [];
      this.updateResumenCalificaciones();
      this.selectedPersonaToAdd = null;
      return;
    }

    this.updateInstructoresEnCurso();
    const reloadKey = this.buildCursoReloadKey(this.selectedCurso);
    if (reloadKey === this.selectedCursoReloadKey) {
      return;
    }

    this.selectedCursoReloadKey = reloadKey;
    void this.loadPersonas({ autoAssign: true, reloadEnCurso: true });
  }

  private normalizeCompanyTag(tag?: string): string {
    return (tag || '').trim().toLowerCase();
  }

  private buildCursoReloadKey(curso: Curso | null | undefined): string {
    if (!curso?.idcurso) {
      return '';
    }

    const cursoDia = this.formatDate(curso.dia ?? curso.Fecha_inicio ?? curso.Fecha_fin) || '';
    const normalizedPersonasIds = Array.from(
      new Set((curso.personasIds || []).map((id) => (id || '').trim()).filter(Boolean))
    ).sort();

    return [
      curso.idcurso,
      cursoDia,
      this.normalizeCompanyTag(curso.companyTag),
      normalizedPersonasIds.join('|')
    ].join('#');
  }

  private isCursoCaducadoParaInstructor(curso: Curso): boolean {
    return isCursoCaducadoParaAsignacion(curso, COURSE_ASSIGNMENT_GRACE_MONTHS);
  }

  private getInstructorIdsForCurrentUser(): Set<string> {
    if (!this.currentUser) return new Set<string>();

    const explicitInstructorId = (this.currentUser.instructorId || '').trim();
    if (explicitInstructorId) {
      return new Set([explicitInstructorId]);
    }

    const normalizedUserName = this.normalizeIdentity(this.currentUser.nombre || '');
    const normalizedEmailAlias = this.normalizeIdentity(
      (this.currentUser.email || '').split('@')[0] || ''
    );

    const ids = this.instructores
      .filter((instructor) => {
        const normalizedInstructorName = this.normalizeIdentity(instructor.nombre || '');
        if (!normalizedInstructorName) return false;

        return (
          (!!normalizedUserName && normalizedInstructorName === normalizedUserName) ||
          (!!normalizedEmailAlias && normalizedInstructorName === normalizedEmailAlias)
        );
      })
      .map((instructor) => instructor.id)
      .filter((id): id is string => !!id);

    return new Set(ids);
  }

  private normalizeIdentity(value: string): string {
    return (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  getCompanyTagOptions(currentTag?: string): string[] {
    const normalizedCurrent = this.normalizeCompanyTag(currentTag);
    if (!normalizedCurrent) return this.companyTags;
    return Array.from(new Set([...this.companyTags, normalizedCurrent]));
  }

  get cursoCityOptions(): string[] {
    return Array.from(
      new Set(
        this.cursos
          .map((curso) => this.parseLocation(curso.descripcion || '').city)
          .filter((city) => !!city)
      )
    ).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }

  get filteredCursosList(): Curso[] {
    const term = this.normalizeSearch(this.cursoSearchTerm);
    const cityFilter = this.normalizeSearch(this.cursoCityFilter);
    if (
      this.filteredCursosListCache &&
      this.filteredCursosListCache.source === this.cursos &&
      this.filteredCursosListCache.term === term &&
      this.filteredCursosListCache.cityFilter === cityFilter &&
      this.filteredCursosListCache.sortBy === this.cursoSortBy &&
      this.filteredCursosListCache.sortDirection === this.cursoSortDirection
    ) {
      return this.filteredCursosListCache.result;
    }

    const filtered = this.cursos.filter((curso) => {
      const parsedLocation = this.parseLocation(curso.descripcion || '');
      const target = this.normalizeText([
        curso.nombre,
        curso.descripcion,
        curso.anioCurso ? String(curso.anioCurso) : '',
        curso.mesCurso ? String(curso.mesCurso) : '',
        curso.companyTag || '',
        curso.nom_representante,
        curso.num_represnetantes,
        parsedLocation.city,
        parsedLocation.state
      ]
        .join(' '));

      const matchesGeneral = !term || target.includes(term);
      const matchesCity = !cityFilter || this.normalizeSearch(parsedLocation.city) === cityFilter;
      return matchesGeneral && matchesCity;
    });

    const result = [...filtered].sort((a, b) => this.compareCursos(a, b));
    this.filteredCursosListCache = {
      source: this.cursos,
      term,
      cityFilter,
      sortBy: this.cursoSortBy,
      sortDirection: this.cursoSortDirection,
      result
    };

    return result;
  }

  get filteredPersonasEnCurso(): Persona[] {
    const term = this.getEffectiveSearchTerm(this.personaSearchTerm);
    if (
      this.filteredPersonasEnCursoCache &&
      this.filteredPersonasEnCursoCache.source === this.personasEnCurso &&
      this.filteredPersonasEnCursoCache.term === term &&
      this.filteredPersonasEnCursoCache.sortBy === this.personaSortBy &&
      this.filteredPersonasEnCursoCache.sortDirection === this.personaSortDirection &&
      this.filteredPersonasEnCursoCache.resultadoFilter === this.resultadoFilter &&
      this.filteredPersonasEnCursoCache.revision === this.personasFilterRevision
    ) {
      return this.filteredPersonasEnCursoCache.result;
    }

    const filtered = this.personasEnCurso.filter((persona) => {
      const matchesSearch = !term || this.getPersonaSearchTarget(persona).includes(term);
      const matchesResultado = this.matchesResultadoFilter(persona);
      return matchesSearch && matchesResultado;
    });

    const result = [...filtered].sort((a, b) => this.comparePersonas(a, b));
    this.filteredPersonasEnCursoCache = {
      source: this.personasEnCurso,
      term,
      sortBy: this.personaSortBy,
      sortDirection: this.personaSortDirection,
      resultadoFilter: this.resultadoFilter,
      revision: this.personasFilterRevision,
      result
    };

    return result;
  }

  get filteredPersonasDisponibles(): Persona[] {
    const term = this.getEffectiveSearchTerm(this.personaDisponibleSearchTerm);
    if (
      this.filteredPersonasDisponiblesCache &&
      this.filteredPersonasDisponiblesCache.source === this.personasDisponibles &&
      this.filteredPersonasDisponiblesCache.term === term &&
      this.filteredPersonasDisponiblesCache.sortBy === this.personaSortBy &&
      this.filteredPersonasDisponiblesCache.sortDirection === this.personaSortDirection
    ) {
      return this.filteredPersonasDisponiblesCache.result;
    }

    const filtered = this.personasDisponibles.filter((persona) =>
      !term || this.getPersonaSearchTarget(persona).includes(term)
    );

    const result = [...filtered].sort((a, b) => this.comparePersonas(a, b));
    this.filteredPersonasDisponiblesCache = {
      source: this.personasDisponibles,
      term,
      sortBy: this.personaSortBy,
      sortDirection: this.personaSortDirection,
      result
    };

    return result;
  }

  get filteredPersonasAsignacion(): Persona[] {
    return this.filteredPersonasDisponibles;
  }

  onCursoSearchTermChange(value: string): void {
    this.cursoSearchTerm = value;
    this.persistSearchState();
  }

  clearCursoCityFilter(): void {
    if (!this.cursoCityFilter) {
      return;
    }

    this.cursoCityFilter = '';
    this.persistSearchState();
  }

  onCursoCityFilterChange(value: string): void {
    this.cursoCityFilter = value;
    this.persistSearchState();
  }

  onPersonaSearchTermChange(value: string): void {
    this.personaSearchTerm = value;
    this.persistSearchState();
  }

  onPersonaDisponibleSearchTermChange(value: string): void {
    this.personaDisponibleSearchTerm = value;
    this.persistSearchState();

    if (this.personaDisponibleSearchTimer) {
      clearTimeout(this.personaDisponibleSearchTimer);
      this.personaDisponibleSearchTimer = null;
    }

    if (!this.selectedCurso?.idcurso) {
      return;
    }

    this.personaDisponibleSearchTimer = setTimeout(() => {
      void this.loadPersonas({ autoAssign: false, reloadEnCurso: false });
    }, 300);
  }

  isPersonaAsignada(personaId: string | null | undefined): boolean {
    if (!personaId || !this.selectedCurso) return false;
    return (this.selectedCurso.personasIds || []).includes(personaId);
  }

  isPersonaDisponibleSeleccionada(personaId: string | null | undefined): boolean {
    if (!personaId) return false;
    return this.filteredPersonasDisponibles.some((persona) => persona.id === personaId);
  }

  isPersonaAsignadaEnOtroCurso(personaId: string | null | undefined): boolean {
    if (!personaId || !this.selectedCurso?.idcurso) return false;
    const persona = this.personas.find((item) => item.id === personaId);
    if (!persona) return false;

    const assignedCursoId = (persona.assignedCursoId || '').trim();
    return !!assignedCursoId && assignedCursoId !== this.selectedCurso.idcurso;
  }

  get personasAsignadasEnBusqueda(): number {
    return 0;
  }

  get personasPendientesEnBusqueda(): number {
    return this.filteredPersonasDisponibles.length;
  }

  getPersonaAsignacionLabel(persona: Persona): string {
    const marca = this.isPersonaAsignada(persona.id) ? '[x]' : '[ ]';
    return `${marca} ${persona.nombre} (${persona.email})`;
  }

  private selectNextPersonaPendiente(): void {
    const siguiente = this.filteredPersonasDisponibles.find((persona) => !this.isPersonaAsignada(persona.id));
    this.selectedPersonaToAdd = siguiente?.id || null;
  }

  private ensurePersonaVisibleInCursoList(personaId: string): void {
    const targetId = (personaId || '').trim();
    if (!targetId) {
      return;
    }

    const persona = this.personasEnCurso.find((item) => (item.id || '').trim() === targetId);
    if (!persona) {
      return;
    }

    let filtersChanged = false;
    let searchChanged = false;

    if (!this.matchesResultadoFilter(persona)) {
      this.resultadoFilter = 'all';
      filtersChanged = true;
    }

    const term = this.normalizeSearch(this.personaSearchTerm);
    const matchesSearch = !term || this.getPersonaSearchTarget(persona).includes(term);
    if (!matchesSearch) {
      this.personaSearchTerm = '';
      this.persistSearchState();
      searchChanged = true;
    }

    if (filtersChanged || searchChanged) {
      this.personasFilterRevision += 1;
      this.notificationService.info(
        'La persona se asigno correctamente. Se ajustaron los filtros para mostrarla en la lista.'
      );
    }
  }

  private mergePersonasContext(asignadas: Persona[], disponibles: Persona[]): Persona[] {
    const deduped = new Map<string, Persona>();

    for (const persona of [...asignadas, ...disponibles]) {
      const id = (persona.id || '').trim();
      if (!id) continue;
      deduped.set(id, persona);
    }

    return [...deduped.values()];
  }

  private updateSelectedCursoPersonasIds(personasIds: string[]): void {
    if (!this.selectedCurso?.idcurso) return;

    const cursoId = this.selectedCurso.idcurso;
    const normalizedPersonasIds = Array.from(new Set(personasIds.map((id) => (id || '').trim()).filter(Boolean)));

    this.selectedCurso = {
      ...this.selectedCurso,
      personasIds: normalizedPersonasIds
    };

    this.allCursos = this.allCursos.map((curso) =>
      curso.idcurso === cursoId
        ? { ...curso, personasIds: [...normalizedPersonasIds] }
        : curso
    );

    this.cursos = this.cursos.map((curso) =>
      curso.idcurso === cursoId
        ? { ...curso, personasIds: [...normalizedPersonasIds] }
        : curso
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

  private getCursoAutoAssignLocation(curso: Curso | null | undefined): string {
    if (!curso) return '';
    return this.normalizeSearch(curso.descripcion || '');
  }

  private getAutoAssignMatchingCursos(
    referenceCurso: Curso | null | undefined,
    referencePeriod?: { year: number; month: number } | null
  ): Curso[] {
    if (!referenceCurso) {
      return [];
    }

    const referenceCompanyTag = this.normalizeCompanyTag(referenceCurso.companyTag);
    const referenceLocation = this.parseLocation(this.getCursoAutoAssignLocation(referenceCurso));
    const effectivePeriod = referencePeriod || this.resolveCursoAssignmentPeriod(referenceCurso);

    if (!referenceCompanyTag || !referenceLocation.raw) {
      return [];
    }

    return this.allCursos.filter((curso) => {
      if (!curso.idcurso) return false;
      if (this.normalizeCompanyTag(curso.companyTag) !== referenceCompanyTag) return false;

      const currentLocation = this.parseLocation(this.getCursoAutoAssignLocation(curso));
      if (!this.isSameAutoAssignLocation(referenceLocation, currentLocation)) {
        return false;
      }

      if (!effectivePeriod) {
        return true;
      }

      const currentPeriod = this.resolveCursoAssignmentPeriod(curso);
      if (!currentPeriod) {
        return false;
      }

      return currentPeriod.year === effectivePeriod.year && currentPeriod.month === effectivePeriod.month;
    });
  }

  private isSameAutoAssignLocation(
    left: { raw: string; parts: string[]; city: string; state: string; hasCityState: boolean },
    right: { raw: string; parts: string[]; city: string; state: string; hasCityState: boolean }
  ): boolean {
    if (!left.raw || !right.raw) {
      return false;
    }

    if (left.hasCityState && right.hasCityState) {
      return left.city === right.city && left.state === right.state;
    }

    const rightParts = new Set(right.parts);
    return left.parts.some((part) => rightParts.has(part));
  }

  private resolveCursoAssignmentPeriod(curso: Curso | null | undefined): { year: number; month: number } | null {
    if (!curso) {
      return null;
    }

    const dia = coerceDate(curso.dia ?? curso.Fecha_inicio ?? curso.Fecha_fin);
    const createdAt = coerceDate(curso.createdAt);
    const year = this.normalizeYearInput(
      dia?.getFullYear() ?? curso.anioCurso ?? createdAt?.getFullYear()
    );
    const month = this.normalizeMonthInput(
      ((dia?.getMonth() ?? -1) + 1) || curso.mesCurso || ((createdAt?.getMonth() ?? -1) + 1)
    );

    if (!year || !month) {
      return null;
    }

    return { year, month };
  }


  private parseLocation(value: string): {
    raw: string;
    parts: string[];
    city: string;
    state: string;
    hasCityState: boolean;
  } {
    const normalized = this.normalizeSearch(value);
    if (!normalized) {
      return { raw: '', parts: [], city: '', state: '', hasCityState: false };
    }

    const rawParts = normalized
      .split(/[;,]+/g)
      .map((part) => part.trim().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
      .filter(Boolean);

    const hasCityState = rawParts.length >= 2;
    const city = hasCityState ? rawParts[0] : '';
    const state = hasCityState ? rawParts[rawParts.length - 1] : '';

    return {
      raw: normalized,
      parts: rawParts.length > 0 ? rawParts : [normalized],
      city,
      state,
      hasCityState
    };
  }

  private normalizeYearInput(value: unknown): number | null {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;

    const normalized = Math.floor(numeric);
    if (normalized < 2000 || normalized > 2100) return null;

    return normalized;
  }

  private normalizeMonthInput(value: unknown): number | null {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;

    const normalized = Math.floor(numeric);
    if (normalized < 1 || normalized > 12) return null;

    return normalized;
  }


  private normalizeSearch(value?: string): string {
    return this.normalizeText(value || '').trim();
  }

  private getEffectiveSearchTerm(value?: string): string {
    const normalized = this.normalizeSearch(value);
    return normalized.length >= 2 ? normalized : '';
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

  private compareCursos(a: Curso, b: Curso): number {
    const direction = this.cursoSortDirection === 'asc' ? 1 : -1;

    if (this.cursoSortBy === 'dia') {
      const diaA = this.toDateValue(a.dia ?? a.Fecha_inicio ?? a.Fecha_fin);
      const diaB = this.toDateValue(b.dia ?? b.Fecha_inicio ?? b.Fecha_fin);
      if (diaA !== diaB) return (diaA - diaB) * direction;
    }

    if (this.cursoSortBy === 'empresa') {
      const empresaA = this.normalizeSearch(a.companyTag || '');
      const empresaB = this.normalizeSearch(b.companyTag || '');
      const compareEmpresa = empresaA.localeCompare(empresaB);
      if (compareEmpresa !== 0) return compareEmpresa * direction;
    }

    const nombreA = this.normalizeSearch(a.nombre || '');
    const nombreB = this.normalizeSearch(b.nombre || '');
    return nombreA.localeCompare(nombreB) * direction;
  }

  private comparePersonas(a: Persona, b: Persona): number {
    const direction = this.personaSortDirection === 'asc' ? 1 : -1;

    if (this.personaSortBy === 'final') {
      const finalA = this.getCalificacionFinal(a) ?? -1;
      const finalB = this.getCalificacionFinal(b) ?? -1;
      if (finalA !== finalB) return (finalA - finalB) * direction;
    }

    if (this.personaSortBy === 'empresa') {
      const empresaA = this.normalizeSearch(a.empresa || '');
      const empresaB = this.normalizeSearch(b.empresa || '');
      const compareEmpresa = empresaA.localeCompare(empresaB);
      if (compareEmpresa !== 0) return compareEmpresa * direction;
    }

    const nombreA = this.normalizeSearch(a.nombre || '');
    const nombreB = this.normalizeSearch(b.nombre || '');
    return nombreA.localeCompare(nombreB) * direction;
  }

  private toDateValue(value: unknown): number {
    const parsed = coerceDate(value);
    if (!parsed) return 0;
    const time = parsed.getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  private restoreSearchState(): void {
    const state = this.viewStateService.getState<CursosGruposSearchState>(this.SEARCH_STATE_KEY, {
      cursoSearchTerm: '',
      cursoCityFilter: '',
      personaSearchTerm: '',
      personaDisponibleSearchTerm: ''
    });

    this.cursoSearchTerm = state.cursoSearchTerm || '';
    this.cursoCityFilter = state.cursoCityFilter || '';
    this.personaSearchTerm = state.personaSearchTerm || '';
    this.personaDisponibleSearchTerm = state.personaDisponibleSearchTerm || '';
  }

  private persistSearchState(): void {
    this.viewStateService.setState<CursosGruposSearchState>(this.SEARCH_STATE_KEY, {
      cursoSearchTerm: this.cursoSearchTerm || '',
      cursoCityFilter: this.cursoCityFilter || '',
      personaSearchTerm: this.personaSearchTerm || '',
      personaDisponibleSearchTerm: this.personaDisponibleSearchTerm || ''
    });
  }
}

