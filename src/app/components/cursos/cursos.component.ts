import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CursoService } from '../../services/curso.service';
import { InstructorService } from '../../services/instructor.service';
import { AuthService } from '../../services/auth.service';
import { ReportService } from '../../services/report.service';
import { NotificationService } from '../../services/notification.service';
import { ViewStateService } from '../../services/view-state.service';
import { Curso } from '../../models/curso.model';
import { Instructor } from '../../models/instructor.model';
import { User } from '../../models/user.model';
import { COURSE_ASSIGNMENT_GRACE_MONTHS } from '../../config/global.constants';
import { coerceDate } from '../../utils/date.util';
import { isCursoCaducadoParaAsignacion } from '../../utils/course-availability.util';
import { sanitizePhoneInput } from '../../utils/input-sanitizers.util';

type CursoArchivo = NonNullable<Curso['archivos']>[number] & {
  file?: File;
};
type FilePreviewType = 'image' | 'pdf' | 'text' | 'unsupported';
type CursosSearchState = {
  searchTerm: string;
  tagSearchTerm: string;
};

type FilteredCursosCache = {
  source: Curso[];
  term: string;
  tagTerm: string;
  sortBy: CursosComponent['sortBy'];
  sortDirection: CursosComponent['sortDirection'];
  result: Curso[];
};

type AvailableInstructoresCache = {
  source: Instructor[];
  result: Instructor[];
};

type FilteredInstructoresCache = {
  source: Instructor[];
  term: string;
  result: Instructor[];
};

@Component({
  selector: 'app-cursos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cursos.component.html',
  styleUrl: './cursos.component.scss'
})
export class CursosComponent implements OnInit, OnDestroy {
  private readonly MIN_INSTRUCTORES = 1;
  private readonly MAX_INSTRUCTORES = 3;
  private readonly SEARCH_STATE_KEY = 'cursos';

  cursos: Curso[] = [];
  allCursos: Curso[] = [];
  instructores: Instructor[] = [];
  companyTags: string[] = [];
  showForm = false;
  showInstructorDropdown = false;
  editingId: string | null = null;
  activeActionMenuId: string | null = null;
  actionMenuPosition = { top: 0, left: 0 };
  selectedCourseDetail: Curso | null = null;
  isAdmin = false;
  currentUser: User | null = null;
  selectedInstructors: string[] = [];
  editingInstructors: string[] = [];
  savingCurso = false;
  deletingCursoId: string | null = null;
  searchTerm: string = '';
  tagSearchTerm: string = '';
  instructorSearchTerm: string = '';
  sortBy: 'nombre' | 'empresa' | 'inicio' | 'fin' = 'nombre';
  sortDirection: 'asc' | 'desc' = 'asc';
  exportingReport = false;
  loadingArchivos = false;
  showFilePreview = false;
  previewFile: CursoArchivo | null = null;
  previewType: FilePreviewType = 'unsupported';
  previewText = '';
  previewResourceUrl: SafeResourceUrl | null = null;
  previewOpenUrl: string | null = null;
  previewError = '';
  private filteredCursosCache: FilteredCursosCache | null = null;
  private availableInstructoresCache: AvailableInstructoresCache | null = null;
  private filteredInstructoresCache: FilteredInstructoresCache | null = null;
  private instructorNameById: Record<string, string> = {};

  updateCurrentRepresentativePhone(value: unknown): void {
    const telefono = sanitizePhoneInput(value);

    if (this.editingId) {
      this.editingCurso.num_represnetantes = telefono;
      return;
    }

    this.newCurso.num_represnetantes = telefono;
  }

  newCurso: Partial<Curso> = {
    nombre: '',
    descripcion: '',
    Fecha_inicio: undefined,
    Fecha_fin: undefined,
    nom_representante: '',
    num_represnetantes: '',
    companyTag: '',
    instructorIds: [],
    archivos: []
  };

  editingCurso: Partial<Curso> = {
    nombre: '',
    descripcion: '',
    Fecha_inicio: undefined,
    Fecha_fin: undefined,
    nom_representante: '',
    num_represnetantes: '',
    companyTag: '',
    instructorIds: [],
    archivos: []
  };

  constructor(
    private cursoService: CursoService,
    private instructorService: InstructorService,
    private authService: AuthService,
    private reportService: ReportService,
    private notificationService: NotificationService,
    private sanitizer: DomSanitizer,
    private viewStateService: ViewStateService
  ) {}

  ngOnInit(): void {
    this.restoreSearchState();
    this.checkAdminStatus();
    this.loadCurrentUser();
    this.loadCompanyTags();
    this.loadCursos();
    this.loadInstructores();
  }

  ngOnDestroy(): void {
    this.persistSearchState();
    this.closeArchivoPreview();
    this.revokeObjectUrls(this.newCurso.archivos as CursoArchivo[] | undefined);
    this.revokeObjectUrls(this.editingCurso.archivos as CursoArchivo[] | undefined);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeFloatingMenus();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.showInstructorDropdown) {
      this.showInstructorDropdown = false;
      return;
    }

    if (this.showFilePreview) {
      this.closeArchivoPreview();
      return;
    }

    if (this.activeActionMenuId) {
      this.activeActionMenuId = null;
      return;
    }

    if (this.selectedCourseDetail) {
      this.closeCursoDetail();
      return;
    }

    if (this.showForm) {
      this.resetForm();
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.closeFloatingMenus();
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.closeFloatingMenus();
  }

  private checkAdminStatus() {
    this.authService.isAdmin().subscribe((isAdmin) => {
      this.isAdmin = isAdmin;
    });
  }

  private loadCurrentUser() {
    this.authService.currentUserData$.subscribe((userData) => {
      this.currentUser = userData;
      this.applyCursoFilter();
    });
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

  loadInstructores() {
    this.instructorService.getInstructores().subscribe({
      next: (instructores) => {
        this.instructores = instructores;
        this.rebuildInstructorNameIndex();
        this.invalidateInstructorCaches();
        this.applyCursoFilter();
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

  toggleForm() {
    if (!this.isAdmin) {
      this.notificationService.warning('No tienes permisos para realizar esta accion');
      return;
    }

    if (this.showForm) {
      this.resetForm();
      return;
    }

    this.closeFloatingMenus();
    this.selectedCourseDetail = null;
    this.editingId = null;
    this.editingCurso = {
      nombre: '',
      descripcion: '',
      Fecha_inicio: undefined,
      Fecha_fin: undefined,
      nom_representante: '',
      num_represnetantes: '',
      companyTag: '',
      instructorIds: [],
      archivos: []
    };
    this.selectedInstructors = [];
    this.editingInstructors = [];
    this.showForm = true;
  }

  async addCurso() {
    if (!this.isAdmin) return;
    if (this.savingCurso) return;

    if (!this.newCurso.nombre || !this.newCurso.descripcion) {
      this.notificationService.warning('Nombre y descripcion son requeridos');
      return;
    }

    if (!this.newCurso.companyTag || !this.newCurso.companyTag.trim()) {
      this.notificationService.warning('La etiqueta de empresa es requerida');
      return;
    }

    const instructorIds = this.normalizeInstructorIds(this.selectedInstructors);
    if (instructorIds.length < this.MIN_INSTRUCTORES || instructorIds.length > this.MAX_INSTRUCTORES) {
      this.notificationService.warning(
        `Debes seleccionar entre ${this.MIN_INSTRUCTORES} y ${this.MAX_INSTRUCTORES} instructores para el curso`
      );
      return;
    }

    try {
      this.savingCurso = true;
      const cursoToAdd: Curso = {
        ...(this.newCurso as Curso),
        num_represnetantes: sanitizePhoneInput(this.newCurso.num_represnetantes),
        companyTag: this.normalizeCompanyTag(this.newCurso.companyTag),
        instructorIds
      };
      await this.cursoService.addCurso(cursoToAdd);
      this.resetForm();
      this.notificationService.success('Curso agregado exitosamente');
    } catch (error) {
      console.error('Error agregando curso:', error);
      this.notificationService.error('Error al agregar curso');
    } finally {
      this.savingCurso = false;
    }
  }

  startEdit(curso: Curso) {
    if (!this.isAdmin) return;

    this.closeFloatingMenus();
    this.selectedCourseDetail = null;
    this.editingId = curso.idcurso || null;
    this.editingCurso = {
      ...curso,
      num_represnetantes: sanitizePhoneInput(curso.num_represnetantes),
      archivos: (curso.archivos || []).map((archivo) => ({ ...archivo }))
    };
    this.editingInstructors = this.normalizeInstructorIds(curso.instructorIds || []);
    this.showInstructorDropdown = false;
    this.closeArchivoPreview();
    this.showForm = true;
  }

  async updateCurso() {
    if (!this.isAdmin || !this.editingId) return;
    if (this.savingCurso) return;

    if (!this.editingCurso.companyTag || !this.editingCurso.companyTag.trim()) {
      this.notificationService.warning('La etiqueta de empresa es requerida');
      return;
    }

    const instructorIds = this.normalizeInstructorIds(this.editingInstructors);
    if (instructorIds.length < this.MIN_INSTRUCTORES || instructorIds.length > this.MAX_INSTRUCTORES) {
      this.notificationService.warning(
        `Debes seleccionar entre ${this.MIN_INSTRUCTORES} y ${this.MAX_INSTRUCTORES} instructores para el curso`
      );
      return;
    }

    try {
      this.savingCurso = true;
      const cursoToUpdate: Partial<Curso> = {
        ...this.editingCurso,
        num_represnetantes: sanitizePhoneInput(this.editingCurso.num_represnetantes),
        companyTag: this.normalizeCompanyTag(this.editingCurso.companyTag),
        instructorIds
      };
      await this.cursoService.updateCurso(this.editingId, cursoToUpdate);
      this.resetForm();
      this.notificationService.success('Curso actualizado exitosamente');
    } catch (error) {
      console.error('Error actualizando curso:', error);
      this.notificationService.error('Error al actualizar curso');
    } finally {
      this.savingCurso = false;
    }
  }

  async deleteCurso(id: string | undefined) {
    if (!this.isAdmin || !id) return;
    if (this.deletingCursoId === id) return;

    this.closeFloatingMenus();
    if (confirm('Estas seguro de eliminar este curso?')) {
      try {
        this.deletingCursoId = id;
        await this.cursoService.deleteCurso(id);
        this.allCursos = this.allCursos.filter((curso) => curso.idcurso !== id);
        this.applyCursoFilter();
        this.notificationService.success('Curso eliminado exitosamente');
        if (this.selectedCourseDetail?.idcurso === id) {
          this.closeCursoDetail();
        }
        if (this.editingId === id) {
          this.resetForm();
        }
      } catch (error) {
        console.error('Error eliminando curso:', error);
        this.notificationService.error('Error al eliminar curso');
      } finally {
        this.deletingCursoId = null;
      }
    }
  }

  resetForm() {
    this.closeArchivoPreview();
    this.revokeObjectUrls(this.newCurso.archivos as CursoArchivo[] | undefined);
    this.revokeObjectUrls(this.editingCurso.archivos as CursoArchivo[] | undefined);

    this.newCurso = {
      nombre: '',
      descripcion: '',
      Fecha_inicio: undefined,
      Fecha_fin: undefined,
      nom_representante: '',
      num_represnetantes: '',
      companyTag: '',
      instructorIds: [],
      archivos: []
    };

    this.editingCurso = {
      nombre: '',
      descripcion: '',
      Fecha_inicio: undefined,
      Fecha_fin: undefined,
      nom_representante: '',
      num_represnetantes: '',
      companyTag: '',
      instructorIds: [],
      archivos: []
    };

    this.selectedInstructors = [];
    this.editingInstructors = [];
    this.editingId = null;
    this.instructorSearchTerm = '';
    this.showInstructorDropdown = false;
    this.showForm = false;
    this.savingCurso = false;
  }

  toggleActionMenu(cursoId: string | undefined, event: MouseEvent) {
    event.stopPropagation();
    if (!cursoId) return;

    this.showInstructorDropdown = false;

    if (this.activeActionMenuId === cursoId) {
      this.activeActionMenuId = null;
      return;
    }

    const trigger = event.currentTarget as HTMLElement | null;
    if (trigger) {
      this.actionMenuPosition = this.getActionMenuPosition(trigger.getBoundingClientRect());
    }

    this.activeActionMenuId = cursoId;
  }

  openCursoDetail(curso: Curso, event?: MouseEvent) {
    event?.stopPropagation();
    this.closeFloatingMenus();
    this.selectedCourseDetail = curso;
  }

  closeCursoDetail() {
    this.selectedCourseDetail = null;
  }

  toggleInstructorDropdown(event: MouseEvent) {
    event.stopPropagation();
    this.activeActionMenuId = null;
    this.showInstructorDropdown = !this.showInstructorDropdown;
    if (this.showInstructorDropdown) {
      this.instructorSearchTerm = '';
    }
  }

  toggleInstructorSelection(instructorId: string | undefined) {
    if (!instructorId) return;

    const selections = this.editingId ? this.editingInstructors : this.selectedInstructors;
    const index = selections.indexOf(instructorId);

    if (index >= 0) {
      if (selections.length <= this.MIN_INSTRUCTORES) {
        this.notificationService.warning(
          `El curso debe conservar al menos ${this.MIN_INSTRUCTORES} instructor`
        );
        return;
      }

      selections.splice(index, 1);
      return;
    }

    if (selections.length >= this.MAX_INSTRUCTORES) {
      this.notificationService.warning(
        `El curso solo puede tener hasta ${this.MAX_INSTRUCTORES} instructores`
      );
      return;
    }

    selections.push(instructorId);
  }

  removeInstructorSelection(instructorId: string) {
    const selections = this.editingId ? this.editingInstructors : this.selectedInstructors;
    const index = selections.indexOf(instructorId);
    if (index >= 0) {
      if (selections.length <= this.MIN_INSTRUCTORES) {
        this.notificationService.warning(
          `El curso debe conservar al menos ${this.MIN_INSTRUCTORES} instructor`
        );
        return;
      }

      selections.splice(index, 1);
    }
  }

  isInstructorSelected(instructorId: string | undefined): boolean {
    if (!instructorId) return false;
    return this.getCurrentInstructors().includes(instructorId);
  }

  canToggleInstructorSelection(instructorId: string | undefined): boolean {
    if (!instructorId) return false;

    const selections = this.getCurrentInstructors();
    const isSelected = selections.includes(instructorId);
    return isSelected
      ? selections.length > this.MIN_INSTRUCTORES
      : selections.length < this.MAX_INSTRUCTORES;
  }

  canRemoveInstructorSelection(instructorId: string): boolean {
    return this.canToggleInstructorSelection(instructorId);
  }

  getInstructorSummary(instructorIds?: string[]): string {
    if (!instructorIds?.length) return 'Sin instructores';

    return instructorIds
      .map((id) => this.getInstructorName(id))
      .slice(0, 2)
      .join(', ');
  }

  getAvailableInstructores(): Instructor[] {
    if (this.availableInstructoresCache?.source === this.instructores) {
      return this.availableInstructoresCache.result;
    }

    const result = this.instructores
      .filter((instructor) => !!instructor.id)
      .sort((a, b) => this.normalizeSearch(a.nombre || '').localeCompare(this.normalizeSearch(b.nombre || '')));

    this.availableInstructoresCache = {
      source: this.instructores,
      result
    };

    return result;
  }

  filteredAvailableInstructores(): Instructor[] {
    const term = this.normalizeSearch(this.instructorSearchTerm);
    const available = this.getAvailableInstructores();
    if (
      this.filteredInstructoresCache &&
      this.filteredInstructoresCache.source === available &&
      this.filteredInstructoresCache.term === term
    ) {
      return this.filteredInstructoresCache.result;
    }

    if (!term) {
      this.filteredInstructoresCache = {
        source: available,
        term,
        result: available
      };
      return available;
    }

    const result = available.filter((instructor) =>
      this.normalizeText([instructor.nombre, instructor.telefono || ''].join(' ')).includes(term)
    );

    this.filteredInstructoresCache = {
      source: available,
      term,
      result
    };

    return result;
  }

  trackByCursoId(index: number, curso: Curso): string {
    return curso.idcurso || curso.nombre || `${index}`;
  }

  trackByInstructorId(index: number, instructor: Instructor): string {
    return instructor.id || instructor.nombre || `${index}`;
  }

  trackByString(index: number, value: string): string {
    return value || `${index}`;
  }

  onSearchTermChange(value: string): void {
    this.searchTerm = value;
    this.persistSearchState();
  }

  onTagSearchTermChange(value: string): void {
    this.tagSearchTerm = value;
    this.persistSearchState();
  }

  getInstructorName(instructorId: string): string {
    return this.instructorNameById[instructorId] || 'Instructor no encontrado';
  }

  getCurrentInstructors(): string[] {
    return this.editingId ? this.editingInstructors : this.selectedInstructors;
  }

  async onFilesSelected(event: Event): Promise<void> {
    if (!this.isAdmin) return;

    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) return;

    const selectedFiles = Array.from(files);
    const validFiles = selectedFiles.filter((file) => this.isAllowedAttachmentFile(file));
    const rejectedCount = selectedFiles.length - validFiles.length;

    if (rejectedCount > 0) {
      this.notificationService.warning('Solo se permiten archivos PDF. Se omitieron archivos no compatibles.');
    }

    if (validFiles.length === 0) {
      input.value = '';
      return;
    }

    this.loadingArchivos = true;

    try {
      const archivos = await Promise.all(validFiles.map(async (file) => ({
        nombre: file.name,
        url: await this.readFileAsDataUrl(file),
        tipo: file.type || this.getFileTypeFromName(file.name),
        size: file.size,
        uploadedAt: new Date(),
        file
      })));

      const target = this.editingId ? this.editingCurso : this.newCurso;
      target.archivos = [
        ...(target.archivos || []),
        ...archivos
      ];
    } catch (error) {
      console.error('Error leyendo archivos del curso:', error);
      this.notificationService.error('No se pudieron leer uno o mas archivos');
    } finally {
      this.loadingArchivos = false;
      input.value = '';
    }
  }

  getCurrentArchivos(): CursoArchivo[] {
    return (this.editingId ? this.editingCurso.archivos : this.newCurso.archivos) || [];
  }

  removeArchivo(index: number): void {
    const target = this.editingId ? this.editingCurso : this.newCurso;
    const archivos = [...(target.archivos || [])];
    const [removed] = archivos.splice(index, 1);

    if (removed?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(removed.url);
    }

    target.archivos = archivos;
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

  trackByArchivo(index: number, archivo: CursoArchivo): string {
    return `${archivo.storagePath || ''}|${archivo.nombre || 'archivo'}|${archivo.url || ''}|${archivo.tipo || ''}|${index}`;
  }

  formatDate(date: Date | string | null | undefined): string | null {
    const parsed = coerceDate(date);
    if (!parsed) return null;
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

  private applyCursoFilter() {
    if (!this.currentUser) {
      this.cursos = this.allCursos;
      return;
    }

    if (this.currentUser.role === 'admin') {
      this.cursos = this.allCursos;
      return;
    }

    if (this.currentUser.role === 'company') {
      const companyTag = this.normalizeCompanyTag(this.currentUser.companyTag);
      if (!companyTag) {
        this.cursos = [];
        return;
      }

      this.cursos = this.allCursos.filter(
        (curso) => this.normalizeCompanyTag(curso.companyTag) === companyTag
      );
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
      return;
    }

    this.cursos = [];
  }

  private normalizeCompanyTag(tag?: string): string {
    return (tag || '').trim().toLowerCase();
  }

  private isCursoCaducadoParaInstructor(curso: Curso): boolean {
    return isCursoCaducadoParaAsignacion(curso, COURSE_ASSIGNMENT_GRACE_MONTHS);
  }

  private normalizeInstructorIds(instructorIds?: string[]): string[] {
    return Array.from(
      new Set((instructorIds || []).map((id) => (id || '').trim()).filter(Boolean))
    );
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

  get canExportReports(): boolean {
    return this.currentUser?.role === 'admin' || this.currentUser?.role === 'company';
  }

  async exportCursosExcel(): Promise<void> {
    if (!this.canExportReports || this.exportingReport) return;

    try {
      this.exportingReport = true;
      await this.reportService.exportCursosToExcel(this.filteredCursos, {
        title: this.getCursosReportTitle(),
        companyTag: this.currentUser?.role === 'company' ? this.currentUser.companyTag : undefined
      });
    } catch (error) {
      console.error('Error exportando cursos a Excel:', error);
      this.notificationService.error('Error al exportar reporte de cursos a Excel');
    } finally {
      this.exportingReport = false;
    }
  }

  async exportCursosPDF(): Promise<void> {
    if (!this.canExportReports || this.exportingReport) return;

    try {
      this.exportingReport = true;
      await this.reportService.exportCursosToPDF(this.filteredCursos, {
        title: this.getCursosReportTitle(),
        companyTag: this.currentUser?.role === 'company' ? this.currentUser.companyTag : undefined
      });
    } catch (error) {
      console.error('Error exportando cursos a PDF:', error);
      this.notificationService.error('Error al exportar reporte de cursos a PDF');
    } finally {
      this.exportingReport = false;
    }
  }

  private getCursosReportTitle(): string {
    if (this.currentUser?.role === 'company' && this.currentUser.companyTag) {
      return `Reporte de Cursos - Empresa: ${this.currentUser.companyTag.toUpperCase()}`;
    }
    return 'Reporte General de Cursos';
  }

  get filteredCursos(): Curso[] {
    const term = this.normalizeSearch(this.searchTerm);
    const tagTerm = this.normalizeSearch(this.tagSearchTerm);
    if (
      this.filteredCursosCache &&
      this.filteredCursosCache.source === this.cursos &&
      this.filteredCursosCache.term === term &&
      this.filteredCursosCache.tagTerm === tagTerm &&
      this.filteredCursosCache.sortBy === this.sortBy &&
      this.filteredCursosCache.sortDirection === this.sortDirection
    ) {
      return this.filteredCursosCache.result;
    }

    const filtered = this.cursos.filter((curso) => {
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

    const result = [...filtered].sort((a, b) => this.compareCursos(a, b));
    this.filteredCursosCache = {
      source: this.cursos,
      term,
      tagTerm,
      sortBy: this.sortBy,
      sortDirection: this.sortDirection,
      result
    };

    return result;
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

  private compareCursos(a: Curso, b: Curso): number {
    const direction = this.sortDirection === 'asc' ? 1 : -1;

    if (this.sortBy === 'inicio') {
      const inicioA = this.toDateValue(a.Fecha_inicio);
      const inicioB = this.toDateValue(b.Fecha_inicio);
      if (inicioA !== inicioB) return (inicioA - inicioB) * direction;
    }

    if (this.sortBy === 'fin') {
      const finA = this.toDateValue(a.Fecha_fin);
      const finB = this.toDateValue(b.Fecha_fin);
      if (finA !== finB) return (finA - finB) * direction;
    }

    if (this.sortBy === 'empresa') {
      const empresaA = this.normalizeSearch(a.companyTag || '');
      const empresaB = this.normalizeSearch(b.companyTag || '');
      const compareEmpresa = empresaA.localeCompare(empresaB);
      if (compareEmpresa !== 0) return compareEmpresa * direction;
    }

    const nombreA = this.normalizeSearch(a.nombre || '');
    const nombreB = this.normalizeSearch(b.nombre || '');
    return nombreA.localeCompare(nombreB) * direction;
  }

  private toDateValue(value: unknown): number {
    if (!value) return 0;
    const date = new Date(value as string | Date);
    const time = date.getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  private getActionMenuPosition(rect: DOMRect): { top: number; left: number } {
    const menuWidth = 180;
    const actionCount = this.isAdmin ? 3 : 1;
    const menuHeight = actionCount * 42 + 12;
    const viewportPadding = 8;
    const preferredTop = rect.bottom + 6;
    const top = preferredTop + menuHeight > window.innerHeight - viewportPadding
      ? Math.max(viewportPadding, rect.top - menuHeight - 6)
      : preferredTop;
    const left = Math.min(
      Math.max(viewportPadding, rect.right - menuWidth),
      window.innerWidth - menuWidth - viewportPadding
    );

    return { top, left };
  }

  private closeFloatingMenus() {
    this.activeActionMenuId = null;
    this.showInstructorDropdown = false;
  }

  private restoreSearchState(): void {
    const state = this.viewStateService.getState<CursosSearchState>(this.SEARCH_STATE_KEY, {
      searchTerm: '',
      tagSearchTerm: ''
    });

    this.searchTerm = state.searchTerm || '';
    this.tagSearchTerm = state.tagSearchTerm || '';
  }

  private persistSearchState(): void {
    this.viewStateService.setState<CursosSearchState>(this.SEARCH_STATE_KEY, {
      searchTerm: this.searchTerm || '',
      tagSearchTerm: this.tagSearchTerm || ''
    });
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

  private invalidateInstructorCaches(): void {
    this.availableInstructoresCache = null;
    this.filteredInstructoresCache = null;
  }
}
