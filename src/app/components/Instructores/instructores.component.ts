import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Servicios
import { InstructorService } from '../../services/instructor.service';
import { CursoService } from '../../services/curso.service';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';

// Modelos
import { Instructor } from '../../models/instructor.model';
import { Curso } from '../../models/curso.model';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-instructores',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './instructores.component.html',
  styleUrls: ['./instructores.component.scss']
})
export class InstructoresComponent implements OnInit {
  @ViewChild('photoInput') photoInput!: ElementRef<HTMLInputElement>;
  @ViewChild('modalPhotoInput') modalPhotoInput!: ElementRef<HTMLInputElement>;

  instructores: Instructor[] = [];
  cursos: Curso[] = [];
  currentUser: User | null = null;

  selectedInstructor: Instructor | null = null;
  cursosAsignados: Curso[] = [];
  cursosDisponibles: Curso[] = [];

  showForm = false;
  previewFoto: string | null = null;
  
  newInstructor: Partial<Instructor> = {
    nombre: '',
    email: '',
    foto: '',
    telefono: '',
    especialidad: '',
    cursoIds: []
  };

  filtroNombre = '';

  // Modal para foto
  showPhotoModal = false;
  modalNewFoto: string | null = null;
  modalPreviewFoto: string | null = null;

  constructor(
    private instructorService: InstructorService,
    private cursoService: CursoService,
    private authService: AuthService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.loadCurrentUser();
    this.cargarInstructores();
    this.cargarCursos();
  }

  // ========== CARGA DE USUARIO ACTUAL ==========
  private loadCurrentUser() {
    this.authService.currentUser$.subscribe(async (firebaseUser) => {
      if (firebaseUser) {
        const userData = await this.authService.getUserData(firebaseUser.uid);
        this.currentUser = userData;
      }
    });
  }

  // ========== MÉTODOS DE PERMISOS ==========
  canCreateInstructor(): boolean {
    return this.currentUser?.role === 'admin';
  }

  canEditInstructor(): boolean {
    return this.currentUser?.role === 'admin';
  }

  canDeleteInstructor(): boolean {
    return this.currentUser?.role === 'admin';
  }

  canAssignCourses(): boolean {
    return this.currentUser?.role === 'admin';
  }

  canViewInstructors(): boolean {
    return true;
  }

  // ========== CARGA DE DATOS ==========
  cargarInstructores() {
    this.instructorService.getInstructores().subscribe({
      next: (instructores) => {
        this.instructores = instructores;
      },
      error: (err) => console.error('Error cargando instructores', err)
    });
  }

  cargarCursos() {
    this.cursoService.getCursos().subscribe({
      next: (cursos) => {
        this.cursos = cursos;
        this.actualizarListasCursos();
      },
      error: (err) => console.error('Error cargando cursos', err)
    });
  }

  // ========== SELECCIÓN DE INSTRUCTOR ==========
  seleccionarInstructor(inst: Instructor) {
    if (!this.canViewInstructors()) return;
    this.selectedInstructor = inst;
    this.actualizarListasCursos();
  }

  // ========== ACTUALIZAR LISTAS DE CURSOS ==========
  actualizarListasCursos() {
    if (!this.selectedInstructor || !this.selectedInstructor.id) {
      this.cursosAsignados = [];
      this.cursosDisponibles = this.cursos;
      return;
    }

    const instructorId = this.selectedInstructor.id;

    this.cursosAsignados = this.cursos.filter(curso =>
      curso.instructorIds?.includes(instructorId)
    );

    this.cursosDisponibles = this.cursos.filter(curso =>
      !curso.instructorIds?.includes(instructorId)
    );
  }

  // ========== ASIGNAR / DESASIGNAR CURSOS ==========
  asignarCurso(cursoId: string) {
    if (!this.canAssignCourses()) {
      this.notificationService.showError('No tienes permisos para asignar cursos');
      return;
    }
    if (!this.selectedInstructor || !this.selectedInstructor.id) return;

    this.instructorService
      .assignInstructorToCurso(this.selectedInstructor.id, cursoId)
      .then(result => {
        if (result.success) {
          this.cargarCursos();
          this.notificationService.showSuccess(result.message);
        } else {
          this.notificationService.showWarning(result.message);
        }
      })
      .catch(err => console.error('Error al asignar curso', err));
  }

  desasignarCurso(cursoId: string) {
    if (!this.canAssignCourses()) {
      this.notificationService.showError('No tienes permisos para desasignar cursos');
      return;
    }
    if (!this.selectedInstructor || !this.selectedInstructor.id) return;

    if (confirm('¿Remover este curso del instructor?')) {
      this.instructorService
        .removeInstructorFromCurso(this.selectedInstructor.id, cursoId)
        .then(() => {
          this.cargarCursos();
          this.notificationService.showSuccess('Curso removido exitosamente');
        })
        .catch(err => console.error('Error al desasignar curso', err));
    }
  }

  // ========== MANEJO DE FOTOS ==========
  triggerPhotoInput() {
    this.photoInput.nativeElement.click();
  }

  onPhotoSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.previewFoto = e.target.result;
      this.newInstructor.foto = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Modal para editar foto
  openEditPhotoModal() {
    if (!this.selectedInstructor) return;
    if (!this.canEditInstructor()) {
      this.notificationService.showError('No tienes permisos para editar fotos');
      return;
    }

    this.modalNewFoto = null;
    this.modalPreviewFoto = this.selectedInstructor.foto || null;
    this.showPhotoModal = true;
  }

  closeEditPhotoModal() {
    this.showPhotoModal = false;
    this.modalNewFoto = null;
    this.modalPreviewFoto = null;
  }

  onModalPhotoSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.modalPreviewFoto = e.target.result;
      this.modalNewFoto = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  async savePhoto() {
    if (!this.selectedInstructor || !this.selectedInstructor.id) return;
    if (!this.modalNewFoto) {
      this.closeEditPhotoModal();
      return;
    }

    try {
      await this.instructorService.updateInstructor(this.selectedInstructor.id, {
        foto: this.modalNewFoto
      });

      this.selectedInstructor.foto = this.modalNewFoto;
      await this.cargarInstructores();
      
      this.notificationService.showSuccess('✅ Foto actualizada exitosamente');
      this.closeEditPhotoModal();
    } catch (error) {
      console.error('Error actualizando foto:', error);
      this.notificationService.showError('Error al actualizar la foto');
    }
  }

  // ========== CRUD INSTRUCTORES ==========
  agregarInstructor() {
    if (!this.canCreateInstructor()) {
      this.notificationService.showError('No tienes permisos para crear instructores');
      return;
    }

    if (!this.newInstructor.nombre?.trim()) {
      this.notificationService.showWarning('El nombre es obligatorio');
      return;
    }

    if (!this.newInstructor.email?.trim()) {
      this.notificationService.showWarning('El email es obligatorio');
      return;
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.newInstructor.email)) {
      this.notificationService.showWarning('Ingresa un email válido');
      return;
    }

    this.instructorService
      .addInstructor(this.newInstructor as Instructor)
      .then(() => {
        this.cargarInstructores();
        this.newInstructor = { 
          nombre: '', 
          email: '', 
          foto: '', 
          telefono: '',
          especialidad: '',
          cursoIds: []
        };
        this.previewFoto = null;
        this.showForm = false;
        this.notificationService.showSuccess('Instructor agregado exitosamente');
      })
      .catch(err => {
        console.error('Error al agregar instructor', err);
        this.notificationService.showError('Error al agregar instructor');
      });
  }

  eliminarInstructor(id?: string) {
    if (!this.canDeleteInstructor()) {
      this.notificationService.showError('No tienes permisos para eliminar instructores');
      return;
    }
    if (!id) return;
    
    if (confirm('¿Estás seguro de eliminar este instructor?')) {
      this.instructorService
        .deleteInstructor(id)
        .then(() => {
          if (this.selectedInstructor?.id === id) {
            this.selectedInstructor = null;
          }
          this.cargarInstructores();
          this.notificationService.showSuccess('Instructor eliminado exitosamente');
        })
        .catch(err => {
          console.error('Error al eliminar instructor', err);
          this.notificationService.showError('Error al eliminar instructor');
        });
    }
  }

  // ========== FILTRO ==========
  get instructoresFiltrados(): Instructor[] {
    if (!this.filtroNombre) return this.instructores;
    const filtro = this.filtroNombre.toLowerCase();
    return this.instructores.filter(
      i =>
        i.nombre.toLowerCase().includes(filtro) ||
        (i.email || '').toLowerCase().includes(filtro) ||
        (i.especialidad || '').toLowerCase().includes(filtro) ||
        (i.telefono || '').includes(filtro)
    );
  }

  // ========== MANEJO DE ERROR DE IMAGEN ==========
  handleImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.src = 'assets/default-avatar.png';
  }
}