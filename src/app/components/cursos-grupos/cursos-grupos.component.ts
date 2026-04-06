import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Observable } from 'rxjs';

import { CursoService } from '../../services/curso.service';
import { InstructorService } from '../../services/instructor.service';
import { PersonaService } from '../../services/persona.service';
import { AuthService } from '../../services/auth.service';
import { ReportData, ReportService } from '../../services/report.service';
import { NotificationService } from '../../services/notification.service';

import { Curso } from '../../models/curso.model';
import { Instructor } from '../../models/instructor.model';
import { Persona } from '../../models/persona.model';
import { User } from '../../models/user.model';
import { coerceDate } from '../../utils/date.util';
import { resolveAppAssetUrl } from '../../utils/asset-url.util';
import { sanitizePhoneInput, sanitizeScoreInput } from '../../utils/input-sanitizers.util';

type CursoArchivo = NonNullable<Curso['archivos']>[number] & {
  file?: File;
};
type FilePreviewType = 'pdf' | 'image' | 'text' | 'unsupported';

@Component({
  selector: 'app-cursos-grupos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cursos-grupos.component.html',
  styleUrl: './cursos-grupos.component.scss'
})
export class CursosGruposComponent implements OnInit, OnDestroy {
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
  defaultInstructorImg = resolveAppAssetUrl('assets/default-avatar.png');

  selectedPersonaToAdd: string | null = null;
  autoAssigningPersonas = false;
  cursoSearchTerm: string = '';
  cursoSortBy: 'nombre' | 'empresa' | 'inicio' | 'fin' = 'nombre';
  cursoSortDirection: 'asc' | 'desc' = 'asc';
  personaSearchTerm: string = '';
  personaDisponibleSearchTerm: string = '';
  personaSortBy: 'nombre' | 'empresa' | 'final' = 'nombre';
  personaSortDirection: 'asc' | 'desc' = 'asc';
  resultadoFilter: 'all' | 'apto' | 'noApto' | 'sinEvaluar' = 'all';
  savingCalificaciones: Record<string, boolean> = {};
  exportingCursoReport = false;
  savingCurso = false;
  deletingCursoId: string | null = null;
  deletingArchivoKey: string | null = null;
  loadingArchivos = false;
  showFilePreview = false;
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
    Fecha_inicio: undefined,
    Fecha_fin: undefined,
    nom_representante: '',
    num_represnetantes: '',
    companyTag: '',
    archivos: []
  };

  editingCursoId: string | null = null;

  editingCurso: Partial<Curso> = {
    nombre: '',
    descripcion: '',
    Fecha_inicio: undefined,
    Fecha_fin: undefined,
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
    private sanitizer: DomSanitizer
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
    this.loadCurrentUser();
    this.loadCompanyTags();
    this.loadCursos();
    this.loadPersonas();
    this.loadInstructores();
  }

  ngOnDestroy(): void {
    this.closeArchivoPreview();
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
        if (this.selectedCurso) {
          this.updatePersonasEnCurso();
          void this.autoAssignPersonasByEmpresaYUbicacion();
        }
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
    this.deletingArchivoKey = null;
    this.selectedCurso = curso;
    this.resultadoFilter = 'all';
    this.updatePersonasEnCurso();
    this.updateInstructoresEnCurso();
    void this.autoAssignPersonasByEmpresaYUbicacion();
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
    const assignedElsewhere = this.getGlobalAssignedPersonaIds(this.selectedCurso.idcurso);

    this.personasEnCurso = this.personas.filter((p) => assignedIds.includes(p.id || ''));

    this.personasDisponibles = this.personas.filter((p) => {
      const personaId = p.id || '';
      if (!personaId) return false;
      return !assignedIds.includes(personaId) && !assignedElsewhere.has(personaId);
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
    if (this.savingCurso) return;

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

    if (id && confirm('Estas seguro de eliminar este curso?')) {
      try {
        this.deletingCursoId = id;
        await this.cursoService.deleteCurso(id);
        this.selectedCurso = null;
        this.personasEnCurso = [];
        this.instructoresEnCurso = [];
        this.allCursos = this.allCursos.filter((curso) => curso.idcurso !== id);
        this.applyCursoFilter();
        this.notificationService.success('Curso eliminado exitosamente');
      } catch (error) {
        console.error('Error eliminando curso:', error);
        this.notificationService.error('Error al eliminar curso');
      } finally {
        this.deletingCursoId = null;
      }
    }
  }

  resetCursoForm() {
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
      this.selectedCurso.personasIds = updatedPersonasIds;
      this.allCursos = this.allCursos.map((curso) =>
        curso.idcurso === cursoId
          ? { ...curso, personasIds: [...updatedPersonasIds] }
          : curso
      );

      this.updatePersonasEnCurso();
      this.selectNextPersonaPendiente();
      this.notificationService.success('Persona asignada al curso');
    } catch (error) {
      console.error('Error agregando persona al curso:', error);
      this.notificationService.error('Error al agregar persona al curso');
    }
  }

  async removePersonaFromCurso(personaId: string | undefined) {
    if (!this.selectedCurso || !personaId) return;
    if (!this.canManagePersonas()) return;

    try {
      const cursoId = this.selectedCurso.idcurso || '';
      await this.cursoService.removePersonaFromCurso(cursoId, personaId);

      const updatedPersonasIds = (this.selectedCurso.personasIds || []).filter((id) => id !== personaId);
      this.selectedCurso.personasIds = updatedPersonasIds;
      this.allCursos = this.allCursos.map((curso) =>
        curso.idcurso === cursoId
          ? { ...curso, personasIds: [...updatedPersonasIds] }
          : curso
      );

      this.updatePersonasEnCurso();
      this.notificationService.info('Persona removida del curso');
    } catch (error) {
      console.error('Error removiendo persona del curso:', error);
      this.notificationService.error('Error al remover persona del curso');
    }
  }

  async autoAssignPersonasByEmpresaYUbicacion(): Promise<void> {
    if (!this.selectedCurso?.idcurso || !this.canManagePersonas() || this.autoAssigningPersonas) return;

    const companyTag = this.normalizeCompanyTag(this.selectedCurso.companyTag);
    const locationTerm = this.getCursoAutoAssignLocation(this.selectedCurso);

    if (!companyTag || !locationTerm) {
      return;
    }

    const candidatos = this.getAutoAssignCandidates(companyTag, locationTerm);
    const nuevosIds = candidatos
      .map((persona) => (persona.id || '').trim())
      .filter(Boolean);

    if (nuevosIds.length === 0) {
      return;
    }

    const cursoId = this.selectedCurso.idcurso;
    const currentCount = (this.selectedCurso.personasIds || []).length;
    const updatedPersonasIds = Array.from(new Set([...(this.selectedCurso.personasIds || []), ...nuevosIds]));

    if (updatedPersonasIds.length === currentCount) {
      return;
    }

    try {
      this.autoAssigningPersonas = true;
      await this.cursoService.updateCurso(cursoId, { personasIds: updatedPersonasIds });

      this.selectedCurso = {
        ...this.selectedCurso,
        personasIds: [...updatedPersonasIds]
      };

      this.allCursos = this.allCursos.map((curso) =>
        curso.idcurso === cursoId
          ? { ...curso, personasIds: [...updatedPersonasIds] }
          : curso
      );

      this.applyCursoFilter();
      this.updatePersonasEnCurso();
      this.selectNextPersonaPendiente();
      this.notificationService.success(
        `Autoasignacion completada: ${nuevosIds.length} persona(s) asignadas por empresa y ubicacion`
      );
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

    if (!confirm(`Estas seguro de eliminar el archivo "${archivoNombre}"?`)) {
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

  private buildCursoReportData(): ReportData {
    const cursoNombre = this.selectedCurso?.nombre || 'Curso sin nombre';
    const instructorName = this.instructoresEnCurso.map((item) => item.nombre).join(', ');
    const personas = this.personasEnCurso;

    return {
      title: `Reporte de Personas - Curso: ${cursoNombre}`,
      generatedAt: new Date(),
      totalPersonas: personas.length,
      personas,
      empresa: this.selectedCurso?.companyTag || '',
      instructorName
    };
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
        return byUserAssignment || byInstructorProfile;
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
      this.personasEnCurso = [];
      this.personasDisponibles = this.personas;
      this.instructoresEnCurso = [];
      this.updateResumenCalificaciones();
      this.selectedPersonaToAdd = null;
      return;
    }

    this.updatePersonasEnCurso();
    this.updateInstructoresEnCurso();
    void this.autoAssignPersonasByEmpresaYUbicacion();
  }

  private normalizeCompanyTag(tag?: string): string {
    return (tag || '').trim().toLowerCase();
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

  get filteredCursosList(): Curso[] {
    const term = this.normalizeSearch(this.cursoSearchTerm);
    const filtered = this.cursos.filter((curso) => {
      const parsedLocation = this.parseLocation(curso.descripcion || '');
      const target = this.normalizeText([
        curso.nombre,
        curso.descripcion,
        curso.companyTag || '',
        curso.nom_representante,
        curso.num_represnetantes,
        parsedLocation.city,
        parsedLocation.state
      ]
        .join(' '));

      const matchesGeneral = !term || target.includes(term);
      return matchesGeneral;
    });

    return [...filtered].sort((a, b) => this.compareCursos(a, b));
  }

  get filteredPersonasEnCurso(): Persona[] {
    const term = this.normalizeSearch(this.personaSearchTerm);
    const filtered = this.personasEnCurso.filter((persona) => {
      const matchesSearch = !term || this.getPersonaSearchTarget(persona).includes(term);
      const matchesResultado = this.matchesResultadoFilter(persona);
      return matchesSearch && matchesResultado;
    });

    return [...filtered].sort((a, b) => this.comparePersonas(a, b));
  }

  get filteredPersonasDisponibles(): Persona[] {
    const term = this.normalizeSearch(this.personaDisponibleSearchTerm);
    const filtered = this.personasDisponibles.filter((persona) =>
      !term || this.getPersonaSearchTarget(persona).includes(term)
    );

    return [...filtered].sort((a, b) => this.comparePersonas(a, b));
  }

  get filteredPersonasAsignacion(): Persona[] {
    return this.filteredPersonasDisponibles;
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
    return this.getGlobalAssignedPersonaIds(this.selectedCurso.idcurso).has(personaId);
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

  private getGlobalAssignedPersonaIds(excludedCursoId?: string): Set<string> {
    const assignedIds = new Set<string>();

    for (const curso of this.allCursos) {
      if (excludedCursoId && curso.idcurso === excludedCursoId) continue;

      for (const personaId of curso.personasIds || []) {
        if (personaId) {
          assignedIds.add(personaId);
        }
      }
    }

    return assignedIds;
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

  private getAutoAssignCandidates(companyTag: string, locationTerm: string): Persona[] {
    return this.personasDisponibles.filter((persona) => this.matchesAutoAssignCriteria(persona, companyTag, locationTerm));
  }

  private getCursoAutoAssignLocation(curso: Curso | null | undefined): string {
    if (!curso) return '';
    return this.normalizeSearch(curso.descripcion || '');
  }

  private matchesAutoAssignCriteria(persona: Persona, companyTag: string, locationTerm: string): boolean {
    const personaId = (persona.id || '').trim();
    if (!personaId) return false;

    if (this.isPersonaAsignada(personaId) || this.isPersonaAsignadaEnOtroCurso(personaId)) {
      return false;
    }

    const personaCompanyTag = this.normalizeCompanyTag(persona.companyTag || persona.empresa || '');
    if (!personaCompanyTag || personaCompanyTag !== companyTag) {
      return false;
    }

    const personaLocation = this.parseLocation(this.getPersonaAutoAssignLocation(persona));
    const cursoLocation = this.parseLocation(locationTerm);
    if (!personaLocation.raw || !cursoLocation.raw) return false;

    if (personaLocation.raw === cursoLocation.raw) {
      return true;
    }

    // Si el curso viene como "ciudad, estado", exigimos coincidencia exacta de ambas partes.
    if (cursoLocation.hasCityState) {
      if (!personaLocation.hasCityState) return false;
      return (
        personaLocation.city === cursoLocation.city &&
        personaLocation.state === cursoLocation.state
      );
    }

    return this.hasSharedLocationToken(personaLocation.raw, cursoLocation.raw);
  }

  private getPersonaAutoAssignLocation(persona: Persona): string {
    const legacyPersona = persona as Persona & { ubicacion?: string; ubicación?: string };
    return String(
      persona.lugar ||
      legacyPersona.ubicacion ||
      legacyPersona['ubicación'] ||
      ''
    );
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

  private hasSharedLocationToken(a: string, b: string): boolean {
    const tokensA = new Set(this.tokenizeLocation(a));
    const tokensB = [...new Set(this.tokenizeLocation(b))];

    if (tokensA.size === 0 || tokensB.length === 0) {
      return false;
    }

    return tokensB.every((token) => tokensA.has(token));
  }

  private tokenizeLocation(value: string): string[] {
    return value
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3);
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

  private compareCursos(a: Curso, b: Curso): number {
    const direction = this.cursoSortDirection === 'asc' ? 1 : -1;

    if (this.cursoSortBy === 'inicio') {
      const inicioA = this.toDateValue(a.Fecha_inicio);
      const inicioB = this.toDateValue(b.Fecha_inicio);
      if (inicioA !== inicioB) return (inicioA - inicioB) * direction;
    }

    if (this.cursoSortBy === 'fin') {
      const finA = this.toDateValue(a.Fecha_fin);
      const finB = this.toDateValue(b.Fecha_fin);
      if (finA !== finB) return (finA - finB) * direction;
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
}

