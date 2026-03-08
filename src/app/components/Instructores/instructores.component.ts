import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InstructorService } from '../../services/instructor.service';
import { CursoService } from '../../services/curso.service';
import { AuthService } from '../../services/auth.service';
import { Instructor } from '../../models/instructor.model';
import { Curso } from '../../models/curso.model';

@Component({
  selector: 'app-instructor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './instructores.component.html',
  styleUrls: ['./instructores.component.scss']
})
export class InstructorComponent implements OnInit, OnDestroy {
  defaultImg = 'assets/default-avatar.png';

  instructores: Instructor[] = [];
  cursos: Curso[] = [];

  editIndex: number | null = null;
  isAdmin = false;
  loadingAssignment = false;
  searchTerm = '';
  sortBy: 'nombre' | 'cursos' = 'nombre';
  sortDirection: 'asc' | 'desc' = 'asc';

  selectedCursoByInstructor: Record<string, string> = {};

  cameraActive = false;
  showPhotoOptions = false;
  private cameraStream: MediaStream | null = null;

  @ViewChild('photoInput') photoInput?: ElementRef<HTMLInputElement>;
  @ViewChild('cameraVideo') cameraVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('cameraCanvas') cameraCanvas?: ElementRef<HTMLCanvasElement>;

  nuevoInstructor: Instructor = {
    nombre: '',
    telefono: '',
    foto: '',
    cursosIds: []
  };

  constructor(
    private instructorService: InstructorService,
    private cursoService: CursoService,
    private authService: AuthService
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
      },
      error: (error) => {
        console.error('Error cargando cursos:', error);
      }
    });
  }

  async guardarInstructor() {
    if (!this.nuevoInstructor.nombre || !this.nuevoInstructor.telefono) {
      alert('Completa los campos requeridos');
      return;
    }

    try {
      if (this.editIndex !== null) {
        const instructor = this.instructores[this.editIndex];
        if (instructor.id) {
          await this.instructorService.updateInstructor(instructor.id, this.nuevoInstructor);
          alert('Instructor actualizado');
        }
      } else {
        await this.instructorService.addInstructor(this.nuevoInstructor);
        alert('Instructor agregado');
      }
      this.cancelar();
    } catch (error) {
      console.error('Error guardando instructor:', error);
      alert(`Error al guardar instructor: ${error}`);
    }
  }

  editarInstructor(instructor: Instructor) {
    if (!this.isAdmin) {
      alert('No tienes permisos para editar instructores');
      return;
    }

    const index = this.instructores.findIndex((item) => item.id === instructor.id);
    if (index < 0) return;

    this.editIndex = index;
    this.nuevoInstructor = { ...this.instructores[index] };
  }

  async eliminarInstructor(instructor: Instructor) {
    if (!this.isAdmin) {
      alert('No tienes permisos para eliminar instructores');
      return;
    }

    if (!confirm(`Eliminar a ${instructor.nombre}?`)) return;

    try {
      if (instructor.id) {
        await this.instructorService.deleteInstructor(instructor.id);
        alert('Instructor eliminado');
      }
    } catch (error) {
      console.error('Error eliminando instructor:', error);
      alert(`Error al eliminar instructor: ${error}`);
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
      alert('Tu navegador no soporta la camara');
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
      alert('No se pudo abrir la camara. Revisa permisos del navegador.');
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
      alert('La camara aun no esta lista. Intenta de nuevo.');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      alert('No se pudo capturar la imagen');
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

  onImgError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.onerror = null;
    img.src = this.defaultImg;
  }

  getCursoNames(cursoIds?: string[]): string {
    if (!cursoIds || cursoIds.length === 0) {
      return 'Sin cursos asignados';
    }

    return cursoIds
      .map(id => this.getCursoNombre(id))
      .join(', ');
  }

  getCursoNombre(cursoId: string): string {
    const curso = this.cursos.find(c => c.idcurso === cursoId);
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
      alert('No tienes permisos para asignar cursos');
      return;
    }

    const cursoId = this.getSelectedCursoId(instructor);
    if (!cursoId) {
      alert('Selecciona un curso');
      return;
    }

    this.loadingAssignment = true;

    try {
      if (this.isCursoAsignado(instructor, cursoId)) {
        await this.instructorService.unassignInstructorFromCurso(instructor.id, cursoId);
        await this.cursoService.removeInstructorFromCurso(cursoId, instructor.id);
        this.updateLocalAsignacion(instructor, cursoId, false);
      } else {
        await this.instructorService.assignInstructorToCurso(instructor.id, cursoId);
        await this.cursoService.addInstructorToCurso(cursoId, instructor.id);
        this.updateLocalAsignacion(instructor, cursoId, true);
      }
    } catch (error) {
      console.error('Error actualizando asignacion:', error);
      alert('No se pudo actualizar la asignacion del curso');
    } finally {
      this.loadingAssignment = false;
    }
  }

  private updateLocalAsignacion(instructor: Instructor, cursoId: string, assign: boolean) {
    const current = instructor.cursosIds || [];

    if (assign) {
      instructor.cursosIds = Array.from(new Set([...current, cursoId]));
      return;
    }

    instructor.cursosIds = current.filter(id => id !== cursoId);
  }

  get filteredInstructores(): Instructor[] {
    const term = this.normalizeSearch(this.searchTerm);
    const filtered = this.instructores.filter((instructor) => {
      const cursos = (instructor.cursosIds || [])
        .map((id) => this.getCursoNombre(id))
        .join(' ');

      const target = this.normalizeText([
        instructor.nombre,
        instructor.telefono || '',
        cursos
      ]
        .join(' '));

      return target.includes(term);
    });

    return [...filtered].sort((a, b) => this.compareInstructores(a, b));
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
