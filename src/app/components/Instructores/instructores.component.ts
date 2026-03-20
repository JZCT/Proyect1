import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InstructorService } from '../../services/instructor.service';
import { CursoService } from '../../services/curso.service';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { Instructor } from '../../models/instructor.model';
import { Curso } from '../../models/curso.model';
import { resolveAppAssetUrl } from '../../utils/asset-url.util';
import { sanitizePhoneInput } from '../../utils/input-sanitizers.util';

@Component({
  selector: 'app-instructor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './instructores.component.html',
  styleUrls: ['./instructores.component.scss']
})
export class InstructorComponent implements OnInit, OnDestroy {
  defaultImg = resolveAppAssetUrl('assets/default-avatar.png');

  instructores: Instructor[] = [];
  cursos: Curso[] = [];

  editIndex: number | null = null;
  isAdmin = false;
  loadingAssignment = false;
  searchTerm = '';
  courseSearchTerm = '';
  sortBy: 'nombre' | 'cursos' = 'nombre';
  sortDirection: 'asc' | 'desc' = 'asc';
  savingInstructor = false;
  deletingInstructorId: string | null = null;

  selectedCursoByInstructor: Record<string, string> = {};
  private cursosById: Record<string, Curso> = {};
  visibleInstructores: Instructor[] = [];
  visibleCursosForEdit: Curso[] = [];

  cameraActive = false;
  showPhotoOptions = false;
  private cameraStream: MediaStream | null = null;

  @ViewChild('photoInput') photoInput?: ElementRef<HTMLInputElement>;
  @ViewChild('cameraVideo') cameraVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('cameraCanvas') cameraCanvas?: ElementRef<HTMLCanvasElement>;

  updateInstructorTelefono(value: unknown): void {
    this.nuevoInstructor.telefono = sanitizePhoneInput(value);
  }

  nuevoInstructor: Instructor = {
    nombre: '',
    telefono: '',
    foto: '',
    cursosIds: []
  };

  constructor(
    private instructorService: InstructorService,
    private cursoService: CursoService,
    private authService: AuthService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.checkAdminStatus();
    this.loadInstructores();
    this.loadCursos();
  }

  ngOnDestroy(): void {
    this.detenerCamara();
  }

  private checkAdminStatus() {
    this.authService.isAdmin().subscribe(isAdmin => {
      this.isAdmin = isAdmin;
    });
  }

  loadInstructores() {
    this.instructorService.getInstructores().subscribe({
      next: (instructores) => {
        this.instructores = instructores;
        this.refreshVisibleInstructores();
      },
      error: (error) => {
        console.error('Error cargando instructores:', error);
      }
    });
  }

  loadCursos() {
    this.cursoService.getCursos().subscribe({
      next: (cursos) => {
        this.cursos = cursos;
        this.cursosById = cursos.reduce<Record<string, Curso>>((acc, curso) => {
          if (curso.idcurso) {
            acc[curso.idcurso] = curso;
          }
          return acc;
        }, {});
        this.refreshVisibleCursosForEdit();
        this.refreshVisibleInstructores();
      },
      error: (error) => {
        console.error('Error cargando cursos:', error);
      }
    });
  }

  async guardarInstructor() {
    if (!this.nuevoInstructor.nombre || !this.nuevoInstructor.telefono) {
      this.notificationService.warning('Completa los campos requeridos');
      return;
    }

    if (this.savingInstructor) {
      return;
    }

    try {
      this.savingInstructor = true;
      const instructorPayload: Instructor = {
        ...this.nuevoInstructor,
        telefono: sanitizePhoneInput(this.nuevoInstructor.telefono),
        cursosIds: this.normalizeCursoIds(this.nuevoInstructor.cursosIds)
      };

      if (this.editIndex !== null) {
        const instructor = this.instructores[this.editIndex];
        if (instructor.id) {
          await this.instructorService.updateInstructor(instructor.id, instructorPayload);
          this.notificationService.success('Instructor actualizado');
        }
      } else {
        await this.instructorService.addInstructor(instructorPayload);
        this.notificationService.success('Instructor agregado');
      }
      this.cancelar();
    } catch (error) {
      console.error('Error guardando instructor:', error);
      this.notificationService.error(
        `Error al guardar instructor: ${error instanceof Error ? error.message : 'Error desconocido'}`
      );
    } finally {
      this.savingInstructor = false;
    }
  }

  editarInstructor(instructor: Instructor) {
    if (!this.isAdmin) {
      this.notificationService.warning('No tienes permisos para editar instructores');
      return;
    }

    const index = this.instructores.findIndex((item) => item.id === instructor.id);
    if (index < 0) return;

    this.editIndex = index;
    this.nuevoInstructor = {
      ...this.instructores[index],
      telefono: sanitizePhoneInput(this.instructores[index].telefono),
      cursosIds: [...(this.instructores[index].cursosIds || [])]
    };
    this.courseSearchTerm = '';
    this.refreshVisibleCursosForEdit();
  }

  async eliminarInstructor(instructor: Instructor) {
    if (!this.isAdmin) {
      this.notificationService.warning('No tienes permisos para eliminar instructores');
      return;
    }

    if (!confirm(`Eliminar a ${instructor.nombre}?`)) return;

    try {
      this.deletingInstructorId = instructor.id || null;
      if (instructor.id) {
        await this.instructorService.deleteInstructor(instructor.id);
        this.instructores = this.instructores.filter((item) => item.id !== instructor.id);
        this.refreshVisibleInstructores();
        if (this.editIndex !== null && this.nuevoInstructor.id === instructor.id) {
          this.cancelar();
        }
        this.notificationService.success('Instructor eliminado');
      }
    } catch (error) {
      console.error('Error eliminando instructor:', error);
      this.notificationService.error(
        `Error al eliminar instructor: ${error instanceof Error ? error.message : 'Error desconocido'}`
      );
    } finally {
      this.deletingInstructorId = null;
    }
  }

  cancelar() {
    this.editIndex = null;
    this.nuevoInstructor = {
      nombre: '',
      telefono: '',
      foto: '',
      cursosIds: []
    };
    this.courseSearchTerm = '';
    this.refreshVisibleCursosForEdit();
    this.showPhotoOptions = false;
    this.detenerCamara();
  }

  togglePhotoOptions() {
    this.showPhotoOptions = !this.showPhotoOptions;
  }

  seleccionarArchivoFoto() {
    this.showPhotoOptions = false;
    this.detenerCamara();
    this.photoInput?.nativeElement.click();
  }

  tomarFotoDesdeMenu() {
    this.showPhotoOptions = false;
    this.iniciarCamara();
  }

  seleccionarImagen(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = () => {
      this.nuevoInstructor.foto = reader.result as string;
      this.showPhotoOptions = false;
      this.detenerCamara();
    };

    reader.readAsDataURL(file);
  }

  isCameraSupported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  async iniciarCamara() {
    if (!this.isCameraSupported()) {
      this.notificationService.warning('Tu navegador no soporta la camara');
      return;
    }

    try {
      this.detenerCamara();
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false
      });

      this.showPhotoOptions = false;
      this.cameraActive = true;
      requestAnimationFrame(() => this.attachCameraStream());
    } catch (error) {
      console.error('Error iniciando camara:', error);
      this.notificationService.error('No se pudo abrir la camara. Revisa permisos del navegador.');
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
    if (!this.cameraVideo || !this.cameraCanvas) return;

    const video = this.cameraVideo.nativeElement;
    const canvas = this.cameraCanvas.nativeElement;

    if (!video.videoWidth || !video.videoHeight) {
      this.notificationService.warning('La camara aun no esta lista. Intenta de nuevo.');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      this.notificationService.error('No se pudo capturar la imagen');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    this.nuevoInstructor.foto = canvas.toDataURL('image/png');
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

  toggleCursoSelection(cursoId: string | undefined) {
    if (!cursoId) return;

    const current = [...(this.nuevoInstructor.cursosIds || [])];
    const index = current.indexOf(cursoId);

    if (index >= 0) {
      current.splice(index, 1);
    } else {
      current.push(cursoId);
    }

    this.nuevoInstructor.cursosIds = this.normalizeCursoIds(current);
  }

  removeCursoSelection(cursoId: string) {
    const current = (this.nuevoInstructor.cursosIds || []).filter((id) => id !== cursoId);
    this.nuevoInstructor.cursosIds = this.normalizeCursoIds(current);
  }

  isCursoSelected(cursoId: string | undefined): boolean {
    if (!cursoId) return false;
    return (this.nuevoInstructor.cursosIds || []).includes(cursoId);
  }

  onSearchTermChange(value: string): void {
    this.searchTerm = value;
    this.refreshVisibleInstructores();
  }

  onCourseSearchTermChange(value: string): void {
    this.courseSearchTerm = value;
    this.refreshVisibleCursosForEdit();
  }

  onSortByChange(value: 'nombre' | 'cursos'): void {
    this.sortBy = value;
    this.refreshVisibleInstructores();
  }

  onSortDirectionChange(value: 'asc' | 'desc'): void {
    this.sortDirection = value;
    this.refreshVisibleInstructores();
  }

  private refreshVisibleCursosForEdit(): void {
    const term = this.normalizeSearch(this.courseSearchTerm);
    const filtered = term
      ? this.cursos.filter((curso) => this.getCursoSearchText(curso).includes(term))
      : [...this.cursos];

    this.visibleCursosForEdit = filtered.sort((a, b) => {
      const nombreA = this.normalizeSearch(a.nombre || '');
      const nombreB = this.normalizeSearch(b.nombre || '');
      return nombreA.localeCompare(nombreB);
    });
  }

  onImgError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.onerror = null;
    img.src = this.defaultImg;
  }

  getCursoNombre(cursoId: string): string {
    const curso = this.cursosById[cursoId];
    return curso ? curso.nombre : 'Curso desconocido';
  }

  getSelectedCursoId(instructor: Instructor): string {
    if (!instructor.id) return '';
    return this.selectedCursoByInstructor[instructor.id] || '';
  }

  isCursoAsignado(instructor: Instructor, cursoId: string): boolean {
    if (!cursoId) return false;
    return !!instructor.cursosIds?.includes(cursoId);
  }

  getEstadoAsignacion(instructor: Instructor, cursoId: string): string {
    return this.isCursoAsignado(instructor, cursoId) ? 'Asignado' : 'No asignado';
  }

  getAccionAsignacion(instructor: Instructor, cursoId: string): string {
    return this.isCursoAsignado(instructor, cursoId) ? 'Desasignar' : 'Asignar';
  }

  async toggleAsignacionCurso(instructor: Instructor) {
    if (!this.isAdmin || !instructor.id) {
      this.notificationService.warning('No tienes permisos para asignar cursos');
      return;
    }

    const cursoId = this.getSelectedCursoId(instructor);
    if (!cursoId) {
      this.notificationService.warning('Selecciona un curso');
      return;
    }

    this.loadingAssignment = true;

    try {
      if (this.isCursoAsignado(instructor, cursoId)) {
        await this.cursoService.removeInstructorFromCurso(cursoId, instructor.id);
        try {
          await this.instructorService.unassignInstructorFromCurso(instructor.id, cursoId);
        } catch (error) {
          try {
            await this.cursoService.addInstructorToCurso(cursoId, instructor.id);
          } catch (rollbackError) {
            console.error('Error revirtiendo desasignacion del curso:', rollbackError);
          }
          throw error;
        }
        this.updateLocalAsignacion(instructor, cursoId, false);
      } else {
        await this.cursoService.addInstructorToCurso(cursoId, instructor.id);
        try {
          await this.instructorService.assignInstructorToCurso(instructor.id, cursoId);
        } catch (error) {
          try {
            await this.cursoService.removeInstructorFromCurso(cursoId, instructor.id);
          } catch (rollbackError) {
            console.error('Error revirtiendo asignacion del curso:', rollbackError);
          }
          throw error;
        }
        this.updateLocalAsignacion(instructor, cursoId, true);
      }
    } catch (error) {
      console.error('Error actualizando asignacion:', error);
      this.notificationService.error(
        error instanceof Error ? error.message : 'No se pudo actualizar la asignacion del curso'
      );
    } finally {
      this.loadingAssignment = false;
    }
  }

  private updateLocalAsignacion(instructor: Instructor, cursoId: string, assign: boolean) {
    const current = instructor.cursosIds || [];

    if (assign) {
      instructor.cursosIds = Array.from(new Set([...current, cursoId]));
      this.refreshVisibleInstructores();
      return;
    }

    instructor.cursosIds = current.filter(id => id !== cursoId);
    this.refreshVisibleInstructores();
  }

  private normalizeCursoIds(cursoIds?: string[]): string[] {
    return Array.from(new Set((cursoIds || []).map((id) => (id || '').trim()).filter(Boolean)));
  }

  trackByInstructorId(_: number, instructor: Instructor): string {
    return instructor.id || instructor.nombre;
  }

  trackByCursoId(_: number, curso: Curso): string {
    return curso.idcurso || curso.nombre;
  }

  trackByString(_: number, value: string): string {
    return value;
  }

  private refreshVisibleInstructores(): void {
    const term = this.normalizeSearch(this.searchTerm);
    const filtered = term
      ? this.instructores.filter((instructor) => this.getInstructorSearchText(instructor).includes(term))
      : [...this.instructores];

    this.visibleInstructores = filtered.sort((a, b) => this.compareInstructores(a, b));
  }

  private normalizeSearch(value?: string): string {
    return this.normalizeText(value || '').trim();
  }

  private getCursoSearchText(curso: Curso): string {
    return this.normalizeText([
      curso.nombre,
      curso.companyTag || '',
      curso.descripcion || '',
      curso.nom_representante || ''
    ].join(' '));
  }

  private getInstructorSearchText(instructor: Instructor): string {
    const cursos = (instructor.cursosIds || [])
      .map((id) => this.getCursoNombre(id))
      .join(' ');

    return this.normalizeText([
      instructor.nombre,
      instructor.telefono || '',
      cursos
    ].join(' '));
  }

  private normalizeText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  private compareInstructores(a: Instructor, b: Instructor): number {
    const direction = this.sortDirection === 'asc' ? 1 : -1;

    if (this.sortBy === 'cursos') {
      const cursosA = a.cursosIds?.length || 0;
      const cursosB = b.cursosIds?.length || 0;
      if (cursosA !== cursosB) return (cursosA - cursosB) * direction;
    }

    const nombreA = this.normalizeSearch(a.nombre || '');
    const nombreB = this.normalizeSearch(b.nombre || '');
    return nombreA.localeCompare(nombreB) * direction;
  }
}
