import { Component, OnDestroy, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { PersonaService } from '../../services/persona.service';
import { CursoService } from '../../services/curso.service';
import { AuthService } from '../../services/auth.service';
import { BulkImportOptions, ImportService } from '../../services/import.service';
import { ReportService } from '../../services/report.service';
import { NotificationService } from '../../services/notification.service';
import { ViewStateService } from '../../services/view-state.service';
import { Persona } from '../../models/persona.model';
import { Curso } from '../../models/curso.model';
import { User } from '../../models/user.model';
import { COURSE_ASSIGNMENT_GRACE_MONTHS } from '../../config/global.constants';
import { resolveAppAssetUrl } from '../../utils/asset-url.util';
import { isCursoCaducadoParaAsignacion } from '../../utils/course-availability.util';
import { normalizeDateInput } from '../../utils/date.util';
import { sanitizePhoneInput, sanitizeScoreInput } from '../../utils/input-sanitizers.util';

type PersonaArchivo = NonNullable<Persona['archivos']>[number] & {
  file?: File;
};
type FilePreviewType = 'image' | 'pdf' | 'text' | 'unsupported';
type FilteredPersonasCache = {
  source: Persona[];
  term: string;
  sortBy: PersonasComponent['sortBy'];
  sortDirection: PersonasComponent['sortDirection'];
  result: Persona[];
};

@Component({
  selector: 'app-personas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './personas.component.html',
  styleUrl: './personas.component.scss'
})
export class PersonasComponent implements OnInit, OnDestroy {
  @ViewChild('photoInput') photoInput!: ElementRef<HTMLInputElement>;
  @ViewChild('excelInput') excelInput!: ElementRef<HTMLInputElement>;
  @ViewChild('cameraVideo') cameraVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('cameraCanvas') cameraCanvas?: ElementRef<HTMLCanvasElement>;
  private readonly SEARCH_STATE_KEY = 'personas';
  private readonly MIN_CALIFICACION_APTO = 80;
  private readonly CURP_REGEX = /^[A-Z0-9]{18}$/;
  private readonly CURRENT_YEAR = new Date().getFullYear();
  private cameraStream: MediaStream | null = null;
  private cursosSubscription: Subscription | null = null;
  private personasSubscription: Subscription | null = null;
  
  personas: Persona[] = [];
  allPersonas: Persona[] = [];
  cursos: Curso[] = [];
  cursosAsignables: Curso[] = [];
  showForm = false;
  editingId: string | null = null;
  loadingFile = false;
  savingPersona = false;
  cameraActive = false;
  showPhotoOptions = false;
  isAdmin = false;
  canGenerateReports = false;
  currentUser: User | null = null;
  loadingPersonas = false;
  personaFilterEnabled = false;
  personaFilterMode: 'single' | 'range' = 'single';
  personaSinglePeriod = `${this.CURRENT_YEAR}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  personaRangeStart = `${this.CURRENT_YEAR}-01`;
  personaRangeEnd = `${this.CURRENT_YEAR}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  searchTerm: string = '';
  sortBy: 'nombre' | 'empresa' | 'final' = 'nombre';
  sortDirection: 'asc' | 'desc' = 'asc';
  selectedPersonaIds = new Set<string>();
  deletingSelected = false;
  assigningSelected = false;
  bulkAssignCursoId = '';
  deletingPersonaId: string | null = null;
  showPersonaEntregables = false;
  personaEntregablesTarget: Persona | null = null;
  showFilePreview = false;
  previewFile: PersonaArchivo | null = null;
  previewType: FilePreviewType = 'unsupported';
  previewText = '';
  previewResourceUrl: SafeResourceUrl | null = null;
  previewOpenUrl: string | null = null;
  previewError = '';
  private cursosById: Record<string, Curso> = {};
  private personaAssignmentLabelById: Record<string, string> = {};
  private filteredPersonasCache: FilteredPersonasCache | null = null;

  // Propiedades para carga masiva
  showBulkImport = false;
  bulkPersonas: Persona[] = [];
  bulkImportLoading = false;
  bulkImportProgress = 0;
  bulkImportError = '';
  selectedExcelFileName = '';
  bulkImportDefaults = {
    empresa: '',
    lugar: '',
    telefono: '',
    emailDomain: 'import.cecapta.local'
  };

  // Propiedades para reportes
  showReports = false;
  reportFilter = {
    tipo: 'all', // all, empresa, lugar
    empresa: '',
    lugar: ''
  };
  empresas: string[] = [];
  lugares: string[] = [];

  newPersona: Partial<Persona> = {
    nombre: '',
    curp: '',
    email: '',
    telefono: '',
    empresa: '',
    companyTag: '',
    lugar: '',
    clfPractica: undefined,
    clfTeorica: undefined,
    foto: '',
    archivos: []
  };

  editingPersona: Partial<Persona> = {
    nombre: '',
    curp: '',
    email: '',
    telefono: '',
    empresa: '',
    companyTag: '',
    lugar: '',
    clfPractica: undefined,
    clfTeorica: undefined,
    foto: '',
    archivos: []
  };

  constructor(
    private personaService: PersonaService,
    private cursoService: CursoService,
    private authService: AuthService,
    private importService: ImportService,
    private reportService: ReportService,
    private notificationService: NotificationService,
    private sanitizer: DomSanitizer,
    private viewStateService: ViewStateService
  ) {}

  get canEditPersonas(): boolean {
    return this.isAdmin || this.currentUser?.role === 'instructor';
  }

  updateCurrentTelefono(value: unknown): void {
    const telefono = sanitizePhoneInput(value);

    if (this.editingId) {
      this.editingPersona.telefono = telefono;
      return;
    }

    this.newPersona.telefono = telefono;
  }

  updateCurrentScore(field: 'clfPractica' | 'clfTeorica', value: unknown): void {
    const score = this.normalizeScoreForStorage(value);

    if (this.editingId) {
      this.editingPersona[field] = score;
      return;
    }

    this.newPersona[field] = score;
  }

  ngOnInit(): void {
    this.restoreSearchState();
    this.checkAdminStatus();
    this.loadCurrentUser();
    this.loadCursosForAssignment();
    this.loadPersonas();
  }

  ngOnDestroy(): void {
    this.persistSearchState();
    this.cursosSubscription?.unsubscribe();
    this.personasSubscription?.unsubscribe();
    this.detenerCamara();
    this.closePersonaEntregablesModal();
    this.closeArchivoPreview();
  }

  private checkAdminStatus() {
    this.authService.isAdmin().subscribe(isAdmin => {
      this.isAdmin = isAdmin;
    });
  }

  private loadCurrentUser() {
    this.authService.currentUserData$.subscribe((userData) => {
      this.currentUser = userData;
      this.canGenerateReports = userData?.role === 'admin' || userData?.role === 'company';
      this.applyCursoAssignmentVisibility();
      this.applyPersonaVisibility();
    });
  }

  private loadCursosForAssignment(): void {
    this.cursosSubscription?.unsubscribe();
    this.cursosSubscription = this.cursoService.getCursos().subscribe({
      next: (cursos) => {
        this.cursos = cursos;
        this.applyCursoAssignmentVisibility();
        this.cursosById = this.cursos.reduce<Record<string, Curso>>((acc, curso) => {
          if (curso.idcurso) {
            acc[curso.idcurso] = curso;
          }
          return acc;
        }, {});
        this.updatePersonaAssignmentLabels();
      },
      error: (error) => {
        console.error('Error cargando cursos para asignacion:', error);
      }
    });
  }

  private applyCursoAssignmentVisibility(): void {
    const activeCursos = this.cursos.filter(
      (curso) => !isCursoCaducadoParaAsignacion(curso, COURSE_ASSIGNMENT_GRACE_MONTHS)
    );

    if (!this.currentUser || this.currentUser.role === 'admin') {
      this.cursosAsignables = activeCursos;
      this.ensureBulkAssignCursoIsValid();
      this.updatePersonaAssignmentLabels();
      return;
    }

    if (this.currentUser.role === 'instructor') {
      const assignedByUser = new Set((this.currentUser.assignedCourseIds || []).filter(Boolean));
      const explicitInstructorId = (this.currentUser.instructorId || '').trim();

      this.cursosAsignables = activeCursos.filter((curso) => {
        const byUserAssignment = !!curso.idcurso && assignedByUser.has(curso.idcurso);
        const byInstructorProfile = !!explicitInstructorId && (curso.instructorIds || []).includes(explicitInstructorId);
        return byUserAssignment || byInstructorProfile;
      });
      this.ensureBulkAssignCursoIsValid();
      this.updatePersonaAssignmentLabels();
      return;
    }

    this.cursosAsignables = [];
    this.ensureBulkAssignCursoIsValid();
    this.updatePersonaAssignmentLabels();
  }

  loadPersonas() {
    this.personasSubscription?.unsubscribe();
    this.personasSubscription = null;
    this.loadingPersonas = true;
    const singlePeriod = this.personaFilterEnabled && this.personaFilterMode === 'single'
      ? this.parseMonthRangeValue(this.personaSinglePeriod)
      : null;
    const rangeFilter = this.personaFilterEnabled && this.personaFilterMode === 'range'
      ? this.resolvePersonaRangeInputs(false)
      : null;

    if (this.personaFilterEnabled && this.personaFilterMode === 'single' && !singlePeriod) {
      this.loadingPersonas = false;
      return;
    }

    if (this.personaFilterEnabled && this.personaFilterMode === 'range' && !rangeFilter) {
      this.loadingPersonas = false;
      return;
    }

    this.personasSubscription = this.personaService.getPersonasByPeriod({
      year: this.personaFilterEnabled && this.personaFilterMode === 'single'
        ? (singlePeriod?.year ?? null)
        : null,
      month: this.personaFilterEnabled && this.personaFilterMode === 'single'
        ? (singlePeriod?.month ?? null)
        : null,
      startYear: this.personaFilterEnabled && this.personaFilterMode === 'range'
        ? (rangeFilter?.startYear ?? null)
        : null,
      startMonth: this.personaFilterEnabled && this.personaFilterMode === 'range'
        ? (rangeFilter?.startMonth ?? null)
        : null,
      endYear: this.personaFilterEnabled && this.personaFilterMode === 'range'
        ? (rangeFilter?.endYear ?? null)
        : null,
      endMonth: this.personaFilterEnabled && this.personaFilterMode === 'range'
        ? (rangeFilter?.endMonth ?? null)
        : null
    }).subscribe({
      next: (personas) => {
        this.allPersonas = personas;
        this.applyPersonaVisibility();
        this.loadingPersonas = false;
      },
      error: (error) => {
        console.error('Error cargando personas:', error);
        this.loadingPersonas = false;
        this.showMessage('No se pudieron cargar las personas');
      }
    });
  }

  clearPersonaRangeFilter(): void {
    if (!this.personaFilterEnabled) {
      return;
    }

    this.personaFilterEnabled = false;
    this.loadPersonas();
  }

  applyPersonaRangeFilter(): void {
    if (this.personaFilterMode === 'single') {
      const single = this.parseMonthRangeValue(this.personaSinglePeriod);
      if (!single) {
        this.showMessage('Selecciona un periodo valido');
        return;
      }
    } else {
      const range = this.resolvePersonaRangeInputs(true);
      if (!range) {
        return;
      }
    }

    this.personaFilterEnabled = true;
    this.loadPersonas();
  }

  getPersonaPeriodFilterLabel(): string {
    if (!this.personaFilterEnabled) {
      return 'Todos los periodos';
    }

    if (this.personaFilterMode === 'single') {
      const single = this.parseMonthRangeValue(this.personaSinglePeriod);
      if (!single) {
        return 'Periodo invalido';
      }

      return `Periodo ${String(single.month).padStart(2, '0')}/${single.year}`;
    }

    const range = this.resolvePersonaRangeInputs(false);
    if (!range) {
      return 'Rango invalido';
    }

    return `Rango ${String(range.startMonth).padStart(2, '0')}/${range.startYear} - ${String(range.endMonth).padStart(2, '0')}/${range.endYear}`;
  }

  private applyPersonaVisibility() {
    if (this.currentUser?.role === 'company') {
      const companyTag = this.normalizeCompanyTag(this.currentUser.companyTag || '');
      this.personas = companyTag
        ? this.allPersonas.filter((persona) =>
          this.normalizeCompanyTag(persona.companyTag || persona.empresa || '') === companyTag
        )
        : [];

      this.reportFilter.tipo = 'empresa';
      this.reportFilter.empresa = this.getCompanyEmpresaName();
      this.reportFilter.lugar = '';
    } else {
      this.personas = [...this.allPersonas];
    }

    this.syncSelectionWithCurrentData();
    this.updateFilterOptions();
    this.ensureBulkAssignCursoIsValid();
    this.updatePersonaAssignmentLabels();
  }

  private getCompanyEmpresaName(): string {
    const withEmpresa = this.personas.find((persona) => (persona.empresa || '').trim());
    if (withEmpresa?.empresa) return withEmpresa.empresa.trim();
    return (this.currentUser?.companyTag || '').trim();
  }

  private updateFilterOptions() {
    // Extraer empresas y lugares únicos
    const toArray = (items: (string | undefined)[]): string[] => {
      return [...new Set(items.filter((item): item is string => item !== undefined))];
    };
    
    this.empresas = toArray(this.personas.map(p => p.empresa)).sort();
    this.lugares = toArray(this.personas.map(p => p.lugar)).sort();
  }

  toggleForm() {
    if (!this.canEditPersonas) {
      this.showMessage('No tienes permisos para realizar esta acción');
      return;
    }
    this.showForm = !this.showForm;
    if (!this.showForm) {
      this.resetForm();
    }
  }

  triggerCamera() {
    if (!this.canEditPersonas) {
      this.showMessage('No tienes permisos para realizar esta acción');
      return;
    }
    this.showPhotoOptions = !this.showPhotoOptions;
  }

  seleccionarArchivoFoto() {
    if (!this.canEditPersonas) return;

    this.showPhotoOptions = false;
    this.detenerCamara();
    this.photoInput.nativeElement.click();
  }

  tomarFotoDesdeMenu() {
    if (!this.canEditPersonas) return;

    this.showPhotoOptions = false;
    this.iniciarCamara();
  }

  async onPhotoSelected(event: Event) {
    if (!this.canEditPersonas) return;

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.loadingFile = true;
      try {
        const dataUrl = await this.readFileAsDataUrl(file);

        if (this.editingId) {
          this.editingPersona.foto = dataUrl;
        } else {
          this.newPersona.foto = dataUrl;
        }

        this.showPhotoOptions = false;
        this.detenerCamara();
      } catch (error) {
        console.error('Error leyendo la foto:', error);
        this.showMessage('No se pudo leer la foto seleccionada');
      } finally {
        this.loadingFile = false;
        input.value = '';
      }
      return;
    }
  }

  isCameraSupported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  async iniciarCamara() {
    if (!this.canEditPersonas) return;

    if (!this.isCameraSupported()) {
      this.showMessage('Tu navegador no soporta la camara');
      return;
    }

    try {
      this.detenerCamara();
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false
      });

      this.cameraActive = true;
      requestAnimationFrame(() => this.attachCameraStream());
    } catch (error) {
      console.error('Error iniciando camara:', error);
      this.showMessage('No se pudo abrir la camara. Revisa permisos del navegador.');
    }
  }

  private attachCameraStream() {
    if (!this.cameraVideo || !this.cameraStream) return;

    const video = this.cameraVideo.nativeElement;
    video.srcObject = this.cameraStream;
    video.play().catch((error) => {
      console.error('Error reproduciendo camara:', error);
    });
  }

  capturarFoto() {
    if (!this.canEditPersonas) return;
    if (!this.cameraVideo || !this.cameraCanvas) return;

    const video = this.cameraVideo.nativeElement;
    const canvas = this.cameraCanvas.nativeElement;

    if (!video.videoWidth || !video.videoHeight) {
      this.showMessage('La camara aun no esta lista. Intenta de nuevo.');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      this.showMessage('No se pudo capturar la imagen');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/png');

    if (this.editingId) {
      this.editingPersona.foto = base64;
    } else {
      this.newPersona.foto = base64;
    }

    this.detenerCamara();
  }

  detenerCamara() {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop());
      this.cameraStream = null;
    }

    if (this.cameraVideo?.nativeElement) {
      this.cameraVideo.nativeElement.srcObject = null;
    }

    this.cameraActive = false;
  }

  async onFilesSelected(event: Event) {
    if (!this.canEditPersonas) return;

    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) return;

    const selectedFiles = Array.from(files);
    const validFiles = selectedFiles.filter((file) => this.isAllowedAttachmentFile(file));
    const rejectedCount = selectedFiles.length - validFiles.length;

    if (rejectedCount > 0) {
      this.showMessage('Solo se permiten archivos PDF. Se omitieron archivos no compatibles.');
    }

    if (validFiles.length === 0) {
      input.value = '';
      return;
    }

    this.loadingFile = true;

    try {
      const archivos = await Promise.all(validFiles.map(async (file) => ({
        nombre: file.name,
        url: await this.readFileAsDataUrl(file),
        tipo: file.type || this.getFileTypeFromName(file.name),
        size: file.size,
        uploadedAt: new Date(),
        file
      })));

      const target = this.editingId ? this.editingPersona : this.newPersona;
      target.archivos = [
        ...(target.archivos || []),
        ...archivos
      ];

      input.value = '';
    } catch (error) {
      console.error('Error leyendo archivos:', error);
      this.showMessage('No se pudieron leer uno o mas archivos');
    } finally {
      this.loadingFile = false;
      input.value = '';
    }
  }

  getFotoUrl(foto: string | undefined): string {
    const normalized = this.normalizeTextField(foto);
    return this.isSafeImageUrl(normalized) ? normalized : resolveAppAssetUrl('assets/default-avatar.png');
  }

  async addPersona() {
    if (!this.canEditPersonas) return;
    if (this.savingPersona) return;

    if (!this.newPersona.nombre || !this.newPersona.email) {
      this.showMessage('Nombre y email son requeridos');
      return;
    }

    const newCurp = this.normalizeCurp(this.newPersona.curp);
    if (!newCurp) {
      this.showMessage('CURP es requerida');
      return;
    }

    if (!this.isValidCurp(newCurp)) {
      this.showMessage('CURP no es valida. Debe tener 18 caracteres alfanumericos');
      return;
    }

    try {
      this.savingPersona = true;
      const personaToSave = this.preparePersonaForSave(this.newPersona);
      await this.personaService.addPersona(personaToSave as Persona);
      this.resetForm();
      this.showForm = false;
    } catch (error) {
      console.error('Error agregando persona:', error);
      this.showMessage(this.getPersonaSaveErrorMessage(error, 'agregar'));
    } finally {
      this.savingPersona = false;
    }
  }

  startEdit(persona: Persona) {
    if (!this.canEditPersonas) return;

    this.editingId = persona.id || null;
    this.editingPersona = {
      ...persona,
      foto: persona.foto || '',
      archivos: (persona.archivos || []).map((archivo) => ({ ...archivo })),
      curp: this.normalizeCurp(persona.curp),
      telefono: sanitizePhoneInput(persona.telefono)
    };
    this.showForm = true;
  }

  async updatePersona() {
    if (!this.canEditPersonas || !this.editingId) return;
    if (this.savingPersona) return;

    const editCurp = this.normalizeCurp(this.editingPersona.curp);
    if (!editCurp) {
      this.showMessage('CURP es requerida');
      return;
    }

    if (!this.isValidCurp(editCurp)) {
      this.showMessage('CURP no es valida. Debe tener 18 caracteres alfanumericos');
      return;
    }

    try {
      this.savingPersona = true;
      const personaToUpdate = this.preparePersonaForSave(this.editingPersona);
      await this.personaService.updatePersona(
        this.editingId,
        personaToUpdate as Persona
      );
      this.resetForm();
    } catch (error) {
      console.error('Error actualizando persona:', error);
      this.showMessage(this.getPersonaSaveErrorMessage(error, 'actualizar'));
    } finally {
      this.savingPersona = false;
    }
  }

  async deletePersona(id: string | undefined) {
    if (!this.isAdmin || !id) return;

    if (confirm('¿Estás seguro de eliminar esta persona?')) {
      try {
        this.deletingPersonaId = id;
        await this.personaService.deletePersona(id);
        this.selectedPersonaIds.delete(id);
        this.allPersonas = this.allPersonas.filter((persona) => persona.id !== id);
        this.applyPersonaVisibility();
        if (this.personaEntregablesTarget?.id === id) {
          this.closePersonaEntregablesModal();
        }
        if (this.editingId === id) {
          this.resetForm();
        }
      } catch (error) {
        console.error('Error eliminando persona:', error);
        this.showMessage('Error al eliminar persona');
      } finally {
        this.deletingPersonaId = null;
      }
    }
  }

  get selectedCount(): number {
    return this.selectedPersonaIds.size;
  }

  isSelected(id: string | undefined): boolean {
    return !!id && this.selectedPersonaIds.has(id);
  }

  isAllFilteredSelected(): boolean {
    const visibleIds = this.getVisibleIds();
    return visibleIds.length > 0 && visibleIds.every(id => this.selectedPersonaIds.has(id));
  }

  isPartiallyFilteredSelected(): boolean {
    const visibleIds = this.getVisibleIds();
    if (visibleIds.length === 0) return false;

    const selectedVisibleCount = visibleIds.filter(id => this.selectedPersonaIds.has(id)).length;
    return selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
  }

  toggleSelection(id: string | undefined, event: Event): void {
    if (!id) return;

    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      this.selectedPersonaIds.add(id);
      return;
    }

    this.selectedPersonaIds.delete(id);
  }

  toggleSelectAllFiltered(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const visibleIds = this.getVisibleIds();

    if (checked) {
      visibleIds.forEach(id => this.selectedPersonaIds.add(id));
      return;
    }

    visibleIds.forEach(id => this.selectedPersonaIds.delete(id));
  }

  selectVisible(): void {
    this.getVisibleIds().forEach(id => this.selectedPersonaIds.add(id));
  }

  clearSelection(): void {
    this.selectedPersonaIds.clear();
  }

  getCursoOptionLabel(curso: Curso): string {
    const empresa = (curso.companyTag || 'sin-empresa').toUpperCase();
    const ubicacion = this.getCursoLocationDisplay(curso);
    const periodo = this.getCursoPeriodLabel(curso);
    return `${curso.nombre} (${empresa}) - ${ubicacion} - ${periodo}`;
  }

  async assignSelectedToCurso(): Promise<void> {
    if (!this.canEditPersonas || this.assigningSelected) return;

    const cursoId = (this.bulkAssignCursoId || '').trim();
    if (!cursoId) {
      this.showMessage('Selecciona un curso destino');
      return;
    }

    const ids = [...this.selectedPersonaIds].filter(Boolean);
    if (ids.length === 0) {
      this.showMessage('Selecciona al menos una persona');
      return;
    }

    const confirmed = confirm(
      `Se intentara asignar ${ids.length} persona(s) al curso seleccionado. ¿Continuar?`
    );
    if (!confirmed) return;

    try {
      this.assigningSelected = true;
      const result = await this.cursoService.addPersonasToCurso(cursoId, ids);
      this.loadPersonas();

      const summary = [
        `Asignadas: ${result.added}`,
        `Omitidas: ${result.skipped}`,
        `Errores: ${result.errors}`
      ].join(' | ');

      this.showMessage(`Asignacion multiple completada. ${summary}`);
      this.clearSelection();
      this.bulkAssignCursoId = '';
    } catch (error) {
      console.error('Error en asignacion multiple de personas:', error);
      const message = error instanceof Error ? error.message : 'No se pudo completar la asignacion multiple';
      this.showMessage(message);
    } finally {
      this.assigningSelected = false;
    }
  }

  getPersonaAssignmentLabel(persona: Persona): string {
    const personaId = (persona.id || '').trim();
    if (personaId && this.personaAssignmentLabelById[personaId]) {
      return this.personaAssignmentLabelById[personaId];
    }

    return this.buildPersonaAssignmentLabel(persona);
  }

  async deleteSelectedPersonas(): Promise<void> {
    if (!this.isAdmin || this.selectedCount === 0 || this.deletingSelected) return;

    const confirmed = confirm(
      `Se eliminaran ${this.selectedCount} personas seleccionadas. Esta accion no se puede deshacer. ¿Continuar?`
    );
    if (!confirmed) return;

    this.deletingSelected = true;
    const idsToDelete = [...this.selectedPersonaIds];

    try {
      await this.personaService.deletePersonas(idsToDelete);
      this.allPersonas = this.allPersonas.filter((persona) => !idsToDelete.includes(persona.id || ''));
      this.applyPersonaVisibility();
      this.clearSelection();
      this.showMessage(`Se eliminaron ${idsToDelete.length} personas`);
    } catch (error) {
      console.error('Error eliminando personas seleccionadas:', error);
      this.showMessage('Error al eliminar personas seleccionadas');
    } finally {
      this.deletingSelected = false;
    }
  }

  resetForm() {
    this.showPhotoOptions = false;
    this.detenerCamara();
    this.closePersonaEntregablesModal();
    this.closeArchivoPreview();
    this.savingPersona = false;
    this.revokeObjectUrls(this.newPersona.archivos as PersonaArchivo[] | undefined);
    this.revokeObjectUrls(this.editingPersona.archivos as PersonaArchivo[] | undefined);

    this.newPersona = {
      nombre: '',
      curp: '',
      email: '',
      telefono: '',
      empresa: '',
      companyTag: '',
      lugar: '',
      clfPractica: undefined,
      clfTeorica: undefined,
      foto: '',
      archivos: []
    };
    
    this.editingPersona = {
      nombre: '',
      curp: '',
      email: '',
      telefono: '',
      empresa: '',
      companyTag: '',
      lugar: '',
      clfPractica: undefined,
      clfTeorica: undefined,
      foto: '',
      archivos: []
    };
    
    this.editingId = null;
    this.showForm = false;
  }

  getCurrentArchivos(): PersonaArchivo[] {
    return (this.editingId ? this.editingPersona.archivos : this.newPersona.archivos) || [];
  }

  getPersonaArchivos(persona: Partial<Persona> | null | undefined): PersonaArchivo[] {
    return (persona?.archivos || []).filter((archivo) => !!archivo?.url && !!archivo?.nombre);
  }

  openPersonaEntregablesModal(persona: Persona): void {
    this.personaEntregablesTarget = persona;
    this.showPersonaEntregables = true;
  }

  closePersonaEntregablesModal(): void {
    this.showPersonaEntregables = false;
    this.personaEntregablesTarget = null;
  }

  formatArchivoSize(size?: number): string {
    const numericSize = Number(size);
    if (!Number.isFinite(numericSize) || numericSize <= 0) {
      return 'Tamano no disponible';
    }

    if (numericSize < 1024) {
      return `${numericSize} B`;
    }

    const kb = numericSize / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)} KB`;
    }

    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  }

  isImageFile(file: PersonaArchivo): boolean {
    const previewType = this.getPreviewType(file);
    return previewType === 'image' && this.canRenderLocalOrRemotePreview(file, previewType);
  }

  canPreviewArchivo(file: PersonaArchivo): boolean {
    const previewType = this.getPreviewType(file);
    return this.isSafeAttachmentUrl(file.url || '', previewType);
  }

  getArchivoPreviewTooltip(file: PersonaArchivo): string {
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

  getArchivoActionLabel(file: PersonaArchivo): string {
    const previewType = this.getPreviewType(file);
    if (previewType === 'unsupported') return 'Abrir';
    if (previewType === 'text' && !this.canLoadTextPreview(file.url || '')) return 'Abrir';
    return 'Ver';
  }

  openArchivo(file: PersonaArchivo): void {
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

  private getPreviewType(file: PersonaArchivo): FilePreviewType {
    const tipo = (file.tipo || '').toLowerCase();
    const nombre = (file.nombre || '').toLowerCase();

    if (tipo.startsWith('image/')) {
      if (tipo === 'image/svg+xml' || nombre.endsWith('.svg')) {
        return 'unsupported';
      }
      return 'image';
    }
    if (tipo.includes('pdf') || nombre.endsWith('.pdf')) return 'pdf';

    const isTextFile =
      tipo.startsWith('text/') ||
      tipo.includes('json') ||
      nombre.endsWith('.txt') ||
      nombre.endsWith('.csv') ||
      nombre.endsWith('.json') ||
      nombre.endsWith('.xml') ||
      nombre.endsWith('.md');

    return isTextFile ? 'text' : 'unsupported';
  }

  private async loadTextPreview(file: PersonaArchivo): Promise<void> {
    try {
      if (!this.canLoadTextPreview(file.url || '')) {
        this.previewText = 'La vista previa de texto no esta disponible para este archivo. Usa Abrir.';
        return;
      }

      const response = await fetch(file.url);
      this.previewText = await response.text();
      return;
    } catch (error) {
      console.error('Error cargando vista previa de texto:', error);
      this.previewText = 'No se pudo mostrar la vista previa de este archivo.';
    }
  }

  removeArchivo(index: number): void {
    const source = this.editingId ? this.editingPersona : this.newPersona;
    const archivos = [...(source.archivos || [])];
    const [removed] = archivos.splice(index, 1);

    if (removed?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(removed.url);
    }

    source.archivos = archivos;
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
    const calificacionFinal = this.getCalificacionFinal(persona);
    if (calificacionFinal === null) return 'Sin evaluar';
    return calificacionFinal >= this.MIN_CALIFICACION_APTO ? 'Apto' : 'No apto';
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

  private preparePersonaForSave(persona: Partial<Persona>): Partial<Persona> {
    return {
      nombre: this.normalizeTextField(persona.nombre),
      curp: this.normalizeCurp(persona.curp),
      email: this.normalizeTextField(persona.email),
      telefono: sanitizePhoneInput(persona.telefono),
      empresa: this.normalizeOptionalTextField(persona.empresa),
      companyTag: this.normalizeCompanyTag(
        this.normalizeOptionalTextField(persona.companyTag) || this.normalizeOptionalTextField(persona.empresa) || ''
      ),
      lugar: this.normalizeOptionalTextField(persona.lugar),
      clfPractica: this.normalizeScoreForStorage(persona.clfPractica),
      clfTeorica: this.normalizeScoreForStorage(persona.clfTeorica),
      foto: this.normalizeAttachmentUrl(persona.foto),
      archivos: (persona.archivos || [])
        .map((archivo) => ({
          nombre: this.normalizeTextField(archivo.nombre),
          url: this.normalizeAttachmentUrl(archivo.url),
          tipo: this.normalizeOptionalTextField(archivo.tipo) || 'application/octet-stream',
          uploadedAt: normalizeDateInput(archivo.uploadedAt),
          size: this.normalizeNumberField(archivo.size),
          storagePath: this.normalizeOptionalTextField(archivo.storagePath),
          file: archivo.file
        }))
        .filter((archivo) => !!archivo.nombre && (!!archivo.url || !!archivo.file))
    };
  }

  private normalizeTextField(value: unknown): string {
    return String(value ?? '').trim();
  }

  private canLoadTextPreview(url: string): boolean {
    const normalizedUrl = this.normalizeTextField(url);
    if (!normalizedUrl) return false;

    const protocol = this.getUrlProtocol(normalizedUrl);
    if (protocol === 'blob:') {
      return true;
    }

    if (protocol === 'data:') {
      return true;
    }

    if (protocol === 'http:' || protocol === 'https:') {
      return this.isTrustedHttpPreviewUrl(normalizedUrl);
    }

    return false;
  }

  private isSafeImageUrl(url: string): boolean {
    const normalizedUrl = this.normalizeTextField(url);
    if (!normalizedUrl) return false;

    const protocol = this.getUrlProtocol(normalizedUrl);
    if (protocol === 'javascript:' || protocol === 'file:' || protocol === 'vbscript:' || protocol === 'blob:') {
      return false;
    }

    if (protocol === 'data:') {
      return this.isAllowedDataUrlForPreview(normalizedUrl, 'image');
    }

    return protocol === 'http:' || protocol === 'https:';
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

      reader.readAsDataURL(file as File);
    });
  }

  private isRenderablePreview(file: PersonaArchivo): boolean {
    const url = this.normalizeTextField(file.url);
    if (!url) return false;
    const previewType = this.getPreviewType(file);
    if (previewType === 'unsupported') return false;
    return this.isRenderablePreviewUrl(url, previewType);
  }

  private isRenderablePreviewUrl(url: string, previewType: FilePreviewType): boolean {
    if (!this.isSafeAttachmentUrl(url, previewType)) {
      return false;
    }

    if (previewType === 'unsupported') {
      return false;
    }

    if (previewType === 'image') {
      return this.isAllowedDataUrlForPreview(url, 'image') || this.isTrustedHttpPreviewUrl(url);
    }

    if (previewType === 'pdf') {
      return this.isAllowedDataUrlForPreview(url, 'pdf') || this.isTrustedHttpPreviewUrl(url);
    }

    if (previewType === 'text') {
      return this.isAllowedDataUrlForPreview(url, 'text') || this.isTrustedHttpPreviewUrl(url);
    }

    return false;
  }

  private canRenderLocalOrRemotePreview(file: PersonaArchivo, previewType: FilePreviewType): boolean {
    return this.isSafeAttachmentUrl(file.url || '', previewType);
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
      return (
        mime.startsWith('text/') ||
        mime === 'application/json' ||
        mime === 'application/xml' ||
        mime === 'application/octet-stream'
      );
    }

    return false;
  }

  private isAllowedDataUrlForAttachment(url: string): boolean {
    const mime = this.getDataUrlMime(url);
    if (!mime) return false;

    if (mime === 'image/svg+xml' || mime === 'text/html' || mime === 'application/javascript') {
      return false;
    }

    return true;
  }

  private getArchivoPreviewError(file: PersonaArchivo): string {
    const protocol = this.getUrlProtocol(file.url || '');
    const previewType = this.getPreviewType(file);

    if (protocol === 'blob:' && file.file) {
      return 'Este archivo se guardo con una URL temporal y ya no se puede previsualizar. Vuelve a cargarlo.';
    }

    if (protocol === 'javascript:' || protocol === 'file:' || protocol === 'vbscript:') {
      return 'La URL de este archivo no es segura y fue bloqueada.';
    }

    if ((protocol === 'http:' || protocol === 'https:') && !this.isTrustedHttpPreviewUrl(file.url || '')) {
      return 'La URL de este archivo apunta a otro origen y fue bloqueada.';
    }

    if (!previewType || previewType === 'unsupported') {
      return 'No hay vista previa integrada para este tipo de archivo. Usa Abrir para verlo.';
    }

    if (!this.isRenderablePreviewUrl(file.url || '', previewType)) {
      return 'El contenido de este archivo no coincide con una vista previa segura.';
    }

    return 'No se pudo abrir este archivo.';
  }

  private normalizeOptionalTextField(value: unknown): string | undefined {
    const normalized = this.normalizeTextField(value);
    return normalized || undefined;
  }

  private normalizeAttachmentUrl(value: unknown): string {
    const normalized = this.normalizeTextField(value);
    if (!normalized) return '';

    const protocol = this.getUrlProtocol(normalized);
    if (protocol === 'javascript:' || protocol === 'file:' || protocol === 'vbscript:' || protocol === 'blob:') {
      return '';
    }

    return normalized;
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
      if (previewType === 'image' || previewType === 'pdf' || previewType === 'text') {
        return this.isAllowedDataUrlForPreview(normalizedUrl, previewType);
      }

      return this.isAllowedDataUrlForAttachment(normalizedUrl);
    }

    return false;
  }

  private getPersonaSaveErrorMessage(error: unknown, action: 'agregar' | 'actualizar'): string {
    const message = error instanceof Error ? error.message.trim() : '';
    return message ? `Error al ${action} persona: ${message}` : `Error al ${action} persona`;
  }

  private normalizeScoreForStorage(value: unknown): number | undefined {
    const score = this.getValidScore(value);
    return score === null ? undefined : score;
  }

  private normalizeNumberField(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }

  private getValidScore(value: unknown): number | null {
    return sanitizeScoreInput(value);
  }

  private revokeObjectUrls(archivos: PersonaArchivo[] | undefined): void {
    if (!archivos?.length) return;

    for (const archivo of archivos) {
      if (archivo.url?.startsWith('blob:')) {
        URL.revokeObjectURL(archivo.url);
      }
    }
  }

  private getFileTypeFromName(fileName: string): string {
    const name = fileName.toLowerCase();

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
    return (file.type || '').toLowerCase() === 'application/pdf' || this.getFileTypeFromName(file.name) === 'application/pdf';
  }

  // ==================== CARGA MASIVA ====================

  triggerBulkImport() {
    if (!this.isAdmin) {
      this.showMessage('No tienes permisos para realizar esta accion');
      return;
    }

    this.syncBulkDefaultsFromCurrentForm();
    this.bulkImportError = '';
    this.bulkImportProgress = 0;
    this.bulkPersonas = [];
    this.selectedExcelFileName = '';
    this.showBulkImport = true;

    const input = this.excelInput.nativeElement;
    input.value = '';
    input.click();
  }

  async onExcelSelected(event: Event) {
    if (!this.isAdmin) return;

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      this.selectedExcelFileName = file.name;
      this.showBulkImport = true;
      this.bulkImportLoading = true;
      this.bulkImportError = '';
      this.bulkPersonas = await this.importService.parseExcelFile(file, this.getBulkImportOptions());
      
      if (this.bulkPersonas.length === 0) {
        this.bulkImportError = 'El archivo no contiene datos validos';
        this.bulkImportLoading = false;
        return;
      }
    } catch (error: any) {
      this.bulkImportError = error.message || 'Error al procesar el archivo Excel';
      console.error('Error en carga masiva:', error);
    } finally {
      this.bulkImportLoading = false;
    }
  }

  async confirmBulkImport() {
    if (!this.isAdmin || this.bulkPersonas.length === 0) return;

    this.bulkImportLoading = true;
    this.bulkImportError = '';
    this.bulkImportProgress = 0;

    try {
      const total = this.bulkPersonas.length;
      
      for (let i = 0; i < this.bulkPersonas.length; i++) {
        try {
          await this.personaService.addPersona({
            ...this.bulkPersonas[i],
            createdAt: new Date()
          } as Persona);
          
          this.bulkImportProgress = Math.round(((i + 1) / total) * 100);
        } catch (error) {
          console.warn(`Error agregando persona ${i + 1}:`, error);
        }
      }

      this.loadPersonas();
      this.bulkPersonas = [];
      this.showBulkImport = false;
      this.showMessage(`✅ Se importaron exitosamente ${this.bulkImportProgress === 100 ? 'todas' : 'la mayoría de'} las personas`);
    } catch (error: any) {
      this.bulkImportError = error.message || 'Error durante la importación masiva';
      console.error('Error en importación masiva:', error);
    } finally {
      this.bulkImportLoading = false;
      this.bulkImportProgress = 0;
    }
  }

  cancelBulkImport() {
    this.showBulkImport = false;
    this.bulkPersonas = [];
    this.bulkImportError = '';
    this.bulkImportProgress = 0;
    this.selectedExcelFileName = '';
  }

  private syncBulkDefaultsFromCurrentForm(): void {
    const source = this.editingId ? this.editingPersona : this.newPersona;
    this.bulkImportDefaults.empresa = this.normalizeTextField(source.empresa);
    this.bulkImportDefaults.lugar = this.normalizeTextField(source.lugar);
    this.bulkImportDefaults.telefono = sanitizePhoneInput(source.telefono);
    this.bulkImportDefaults.emailDomain = this.normalizeEmailDomain(this.bulkImportDefaults.emailDomain);
  }

  private getBulkImportOptions(): BulkImportOptions {
    return {
      defaultEmpresa: this.normalizeTextField(this.bulkImportDefaults.empresa),
      defaultLugar: this.normalizeTextField(this.bulkImportDefaults.lugar),
      defaultTelefono: sanitizePhoneInput(this.bulkImportDefaults.telefono),
      emailDomain: this.normalizeEmailDomain(this.bulkImportDefaults.emailDomain)
    };
  }

  async downloadTemplate() {
    try {
      this.bulkImportLoading = true;
      await this.importService.generateTemplate();
    } catch (error) {
      console.error('Error generando plantilla:', error);
      this.showMessage('Error al generar plantilla');
    } finally {
      this.bulkImportLoading = false;
    }
  }

  // ==================== REPORTES ====================

  toggleReports() {
    if (!this.canGenerateReports) {
      this.showMessage('No tienes permisos para generar reportes');
      return;
    }
    this.showReports = !this.showReports;
  }

  private buildReportFilter(): { empresa?: string; lugar?: string } {
    if (this.currentUser?.role === 'company') {
      const empresa = this.getCompanyEmpresaName();
      return empresa ? { empresa } : {};
    }

    const filter: { empresa?: string; lugar?: string } = {};

    if (this.reportFilter.tipo === 'empresa' && this.reportFilter.empresa) {
      filter.empresa = this.reportFilter.empresa;
    } else if (this.reportFilter.tipo === 'lugar' && this.reportFilter.lugar) {
      filter.lugar = this.reportFilter.lugar;
    }

    return filter;
  }

  async generateReport() {
    if (!this.canGenerateReports) return;

    try {
      const filter = this.buildReportFilter();
      const reportData = this.reportService.generateReportData(this.personas, filter);
      
      this.showMessage(`📊 Reporte generado: ${reportData.totalPersonas} personas`);
    } catch (error: any) {
      console.error('Error generando reporte:', error);
      this.showMessage('Error al generar reporte');
    }
  }

  async exportReportCSV() {
    if (!this.canGenerateReports) return;

    try {
      const filter = this.buildReportFilter();
      const reportData = this.reportService.generateReportData(this.personas, filter);
      this.reportService.exportToCSV(reportData);
    } catch (error: any) {
      console.error('Error exportando CSV:', error);
      this.showMessage('Error al exportar reporte');
    }
  }

  async exportReportExcel() {
    if (!this.canGenerateReports) return;

    try {
      const filter = this.buildReportFilter();
      const reportData = this.reportService.generateReportData(this.personas, filter);
      await this.reportService.exportToExcel(reportData);
    } catch (error: any) {
      console.error('Error exportando Excel:', error);
      this.showMessage('Error al exportar reporte');
    }
  }

  async exportReportPDF() {
    if (!this.canGenerateReports) return;

    try {
      const filter = this.buildReportFilter();
      const reportData = this.reportService.generateReportData(this.personas, filter);
      await this.reportService.exportToPDF(reportData, {
        onClose: () => {
          this.showReports = false;
        }
      });
    } catch (error: any) {
      console.error('Error exportando PDF:', error);
      this.showMessage('Error al exportar reporte');
    }
  }

  onSearchTermChange(value: string): void {
    this.searchTerm = value;
    this.persistSearchState();
  }

  get filteredPersonas(): Persona[] {
    const term = this.normalizeSearch(this.searchTerm);
    if (
      this.filteredPersonasCache &&
      this.filteredPersonasCache.source === this.personas &&
      this.filteredPersonasCache.term === term &&
      this.filteredPersonasCache.sortBy === this.sortBy &&
      this.filteredPersonasCache.sortDirection === this.sortDirection
    ) {
      return this.filteredPersonasCache.result;
    }

    const filtered = this.personas.filter((persona) => {
      const target = this.normalizeText([
        persona.nombre,
        persona.email,
        persona.telefono || '',
        persona.empresa || '',
        persona.lugar || '',
        persona.curp || '',
        persona.anioPersona ? String(persona.anioPersona) : '',
        persona.mesPersona ? String(persona.mesPersona) : '',
        this.getResultadoTexto(persona)
      ]
        .join(' '));

      return target.includes(term);
    });

    const result = filtered.sort((a, b) => this.comparePersonas(a, b));
    this.filteredPersonasCache = {
      source: this.personas,
      term,
      sortBy: this.sortBy,
      sortDirection: this.sortDirection,
      result
    };

    return result;
  }

  getPersonaPeriodDisplay(persona: Partial<Persona>): string {
    const year = this.resolvePersonaYearValue(persona);
    const month = this.resolvePersonaMonthValue(persona);

    if (year && month) {
      return `Periodo: ${year}/${String(month).padStart(2, '0')}`;
    }

    if (year) {
      return `Periodo: ${year}`;
    }

    const createdAt = normalizeDateInput(persona.createdAt);
    if (createdAt) {
      const fallbackYear = createdAt.getFullYear();
      const fallbackMonth = String(createdAt.getMonth() + 1).padStart(2, '0');
      return `Periodo: ${fallbackYear}/${fallbackMonth}`;
    }

    return 'Periodo: sin fecha';
  }

  private normalizeSearch(value?: string): string {
    return this.normalizeText(value || '').trim();
  }

  private getVisibleIds(): string[] {
    return this.filteredPersonas
      .map(persona => persona.id)
      .filter((id): id is string => !!id);
  }

  trackByCursoId(index: number, curso: Curso): string {
    return curso.idcurso || curso.nombre || `${index}`;
  }

  trackByPersonaId(index: number, persona: Persona): string {
    return persona.id || persona.curp || persona.email || persona.nombre || `${index}`;
  }

  trackByArchivo(index: number, archivo: PersonaArchivo): string {
    return `${archivo.storagePath || ''}|${archivo.nombre || 'archivo'}|${archivo.url || ''}|${archivo.tipo || ''}|${index}`;
  }

  trackByBulkPersona(index: number, persona: Persona): string {
    return persona.id || persona.curp || persona.email || persona.nombre || `${index}`;
  }

  private syncSelectionWithCurrentData(): void {
    const validIds = new Set(
      this.personas
        .map(persona => persona.id)
        .filter((id): id is string => !!id)
    );

    this.selectedPersonaIds = new Set(
      [...this.selectedPersonaIds].filter(id => validIds.has(id))
    );
  }

  private ensureBulkAssignCursoIsValid(): void {
    const cursoId = (this.bulkAssignCursoId || '').trim();
    if (!cursoId) return;

    const isValid = this.cursosAsignables.some((curso) => curso.idcurso === cursoId);
    if (!isValid) {
      this.bulkAssignCursoId = '';
    }
  }

  private updatePersonaAssignmentLabels(): void {
    const labels: Record<string, string> = {};

    for (const persona of this.personas) {
      const personaId = (persona.id || '').trim();
      if (!personaId) continue;
      labels[personaId] = this.buildPersonaAssignmentLabel(persona);
    }

    this.personaAssignmentLabelById = labels;
  }

  private buildPersonaAssignmentLabel(persona: Partial<Persona>): string {
    const assignedCursoId = (persona.assignedCursoId || '').trim();
    if (assignedCursoId) {
      return `Asignado a: ${this.getCursoNombreById(assignedCursoId)}`;
    }

    const candidateCursos = this.getCandidateCursosForPersona(persona);
    if (candidateCursos.length > 1) {
      return `Pendiente de asignacion (${candidateCursos.length} cursos)`;
    }

    if (candidateCursos.length === 1) {
      return `Disponible para: ${candidateCursos[0].nombre}`;
    }

    return 'Disponible';
  }

  private getCursoNombreById(cursoId: string): string {
    const normalizedId = (cursoId || '').trim();
    if (!normalizedId) return 'Curso sin definir';

    const curso = this.cursosById[normalizedId];
    if (!curso) return normalizedId;

    return this.getCursoCompactLabel(curso);
  }

  private getCursoCompactLabel(curso: Partial<Curso>): string {
    const nombre = (curso.nombre || 'Curso').trim();
    const ubicacion = this.getCursoLocationDisplay(curso);
    const periodo = this.getCursoPeriodLabel(curso);
    return `${nombre} (${ubicacion}, ${periodo})`;
  }

  private getCursoLocationDisplay(curso: Partial<Curso>): string {
    const rawDescription = this.normalizeTextField(curso.descripcion);
    if (!rawDescription) return 'Sin ubicacion';

    const segments = rawDescription
      .split(/[;,]+/g)
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (segments.length === 0) return 'Sin ubicacion';
    if (segments.length === 1) return segments[0];

    return `${segments[0]} / ${segments[segments.length - 1]}`;
  }

  private getCursoPeriodLabel(curso: Partial<Curso>): string {
    const period = this.resolveCursoPeriod(curso);
    if (!period) {
      return 'Periodo s/f';
    }

    return `Periodo ${String(period.month).padStart(2, '0')}/${period.year}`;
  }

  private getCandidateCursosForPersona(persona: Partial<Persona>): Curso[] {
    const companyTag = this.normalizeCompanyTag((persona.companyTag || persona.empresa || '').trim());
    if (!companyTag) return [];

    const personaLocation = this.parseLocationForAssignment(persona.lugar || '');
    if (!personaLocation.raw) return [];

    const personaYear = this.resolvePersonaYearValue(persona);
    const personaMonth = this.resolvePersonaMonthValue(persona);

    return this.cursosAsignables.filter((curso) => {
      if (this.normalizeCompanyTag((curso.companyTag || '').trim()) !== companyTag) {
        return false;
      }

      const cursoLocation = this.parseLocationForAssignment(curso.descripcion || '');
      if (!this.isSameLocationForAssignment(personaLocation, cursoLocation)) {
        return false;
      }

      if (personaYear && personaMonth) {
        const cursoPeriod = this.resolveCursoPeriod(curso);
        if (!cursoPeriod) return false;
        return cursoPeriod.year === personaYear && cursoPeriod.month === personaMonth;
      }

      return true;
    });
  }

  private resolveCursoPeriod(curso: Partial<Curso>): { year: number; month: number } | null {
    const inicio = normalizeDateInput(curso.Fecha_inicio);
    if (inicio) {
      const yearFromInicio = this.normalizeYearInput(inicio.getFullYear());
      const monthFromInicio = this.normalizeMonthInput(inicio.getMonth() + 1);
      if (yearFromInicio && monthFromInicio) {
        return { year: yearFromInicio, month: monthFromInicio };
      }
    }

    const explicitYear = this.normalizeYearInput(curso.anioCurso);
    const explicitMonth = this.normalizeMonthInput(curso.mesCurso);
    if (!explicitYear || !explicitMonth) return null;

    return { year: explicitYear, month: explicitMonth };
  }

  private parseLocationForAssignment(value: string): {
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

    const parts = normalized
      .split(/[;,]+/g)
      .map((part) => part.trim().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
      .filter(Boolean);

    const hasCityState = parts.length >= 2;
    const city = hasCityState ? parts[0] : '';
    const state = hasCityState ? parts[parts.length - 1] : '';

    return {
      raw: normalized,
      parts: parts.length > 0 ? parts : [normalized],
      city,
      state,
      hasCityState
    };
  }

  private isSameLocationForAssignment(
    left: { raw: string; parts: string[]; city: string; state: string; hasCityState: boolean },
    right: { raw: string; parts: string[]; city: string; state: string; hasCityState: boolean }
  ): boolean {
    if (!left.raw || !right.raw) return false;

    if (left.hasCityState && right.hasCityState) {
      return left.city === right.city && left.state === right.state;
    }

    const rightParts = new Set(right.parts);
    return left.parts.some((part) => rightParts.has(part));
  }

  private normalizeText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
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

  private resolvePersonaRangeInputs(showWarnings: boolean): {
    startYear: number;
    startMonth: number;
    endYear: number;
    endMonth: number;
  } | null {
    const startPeriod = this.parseMonthRangeValue(this.personaRangeStart);
    const endPeriod = this.parseMonthRangeValue(this.personaRangeEnd);

    if (!startPeriod || !endPeriod) {
      if (showWarnings) {
        this.showMessage('Completa un rango valido de inicio y fin');
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

  private resolvePersonaYearValue(persona: Partial<Persona>): number | null {
    const explicitYear = this.normalizeYearInput(persona.anioPersona);
    if (explicitYear) return explicitYear;

    const createdAt = normalizeDateInput(persona.createdAt);
    if (!createdAt) return null;

    return this.normalizeYearInput(createdAt.getFullYear());
  }

  private resolvePersonaMonthValue(persona: Partial<Persona>): number | null {
    const explicitMonth = this.normalizeMonthInput(persona.mesPersona);
    if (explicitMonth) return explicitMonth;

    const createdAt = normalizeDateInput(persona.createdAt);
    if (!createdAt) return null;

    return this.normalizeMonthInput(createdAt.getMonth() + 1);
  }

  private comparePersonas(a: Persona, b: Persona): number {
    const direction = this.sortDirection === 'asc' ? 1 : -1;

    if (this.sortBy === 'final') {
      const finalA = this.getCalificacionFinal(a) ?? -1;
      const finalB = this.getCalificacionFinal(b) ?? -1;
      return (finalA - finalB) * direction;
    }

    if (this.sortBy === 'empresa') {
      const empresaA = this.normalizeText(a.empresa || '');
      const empresaB = this.normalizeText(b.empresa || '');
      const result = empresaA.localeCompare(empresaB);
      if (result !== 0) return result * direction;
    }

    const nombreA = this.normalizeText(a.nombre || '');
    const nombreB = this.normalizeText(b.nombre || '');
    return nombreA.localeCompare(nombreB) * direction;
  }

  private showMessage(message: unknown): void {
    this.notificationService.notifyFromAlert(message);
  }

  normalizeCurp(value?: string): string {
    return (value || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .trim();
  }

  private normalizeCompanyTag(value: string): string {
    return (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .trim();
  }

  private normalizeEmailDomain(value: string): string {
    return (value || '')
      .toLowerCase()
      .trim()
      .replace(/^@+/, '')
      .replace(/[^a-z0-9.-]/g, '') || 'import.cecapta.local';
  }

  private isValidCurp(value?: string): boolean {
    return this.CURP_REGEX.test(this.normalizeCurp(value));
  }

  private restoreSearchState(): void {
    const state = this.viewStateService.getState<{ searchTerm: string }>(this.SEARCH_STATE_KEY, {
      searchTerm: ''
    });

    this.searchTerm = state.searchTerm || '';
  }

  private persistSearchState(): void {
    this.viewStateService.setState<{ searchTerm: string }>(this.SEARCH_STATE_KEY, {
      searchTerm: this.searchTerm || ''
    });
  }
}







