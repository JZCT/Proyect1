import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CursoService } from '../../services/curso.service';
import { InstructorService } from '../../services/instructor.service';
import { AuthService } from '../../services/auth.service';
import { ReportService } from '../../services/report.service';
import { NotificationService } from '../../services/notification.service';
import { Curso } from '../../models/curso.model';
import { Instructor } from '../../models/instructor.model';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-cursos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cursos.component.html',
  styleUrl: './cursos.component.scss'
})
export class CursosComponent implements OnInit {
  cursos: Curso[] = [];
  allCursos: Curso[] = [];
  instructores: Instructor[] = [];
  companyTags: string[] = [];
  showForm = false;
  editingId: string | null = null;
  isAdmin = false;
  currentUser: User | null = null;
  selectedInstructors: string[] = [];
  editingInstructors: string[] = [];
  searchTerm: string = '';
  tagSearchTerm: string = '';
  sortBy: 'nombre' | 'empresa' | 'inicio' | 'fin' = 'nombre';
  sortDirection: 'asc' | 'desc' = 'asc';
  exportingReport = false;

  newCurso: Partial<Curso> = {
    nombre: '',
    descripcion: '',
    Fecha_inicio: undefined,
    Fecha_fin: undefined,
    nom_representante: '',
    num_represnetantes: '',
    companyTag: '',
    instructorIds: []
  };

  editingCurso: Partial<Curso> = {
    nombre: '',
    descripcion: '',
    Fecha_inicio: undefined,
    Fecha_fin: undefined,
    nom_representante: '',
    num_represnetantes: '',
    companyTag: '',
    instructorIds: []
  };

  constructor(
    private cursoService: CursoService,
    private instructorService: InstructorService,
    private authService: AuthService,
    private reportService: ReportService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.checkAdminStatus();
    this.loadCurrentUser();
    this.loadCompanyTags();
    this.loadCursos();
    this.loadInstructores();
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

    this.showForm = !this.showForm;
    if (!this.showForm) {
      this.resetForm();
    }
  }

  async addCurso() {
    if (!this.isAdmin) return;

    if (!this.newCurso.nombre || !this.newCurso.descripcion) {
      this.notificationService.warning('Nombre y descripcion son requeridos');
      return;
    }

    if (!this.newCurso.companyTag || !this.newCurso.companyTag.trim()) {
      this.notificationService.warning('La etiqueta de empresa es requerida');
      return;
    }

    if (!this.selectedInstructors || this.selectedInstructors.length < 3) {
      this.notificationService.warning('Debes seleccionar minimo 3 instructores para el curso');
      return;
    }

    try {
      const cursoToAdd: Curso = {
        ...(this.newCurso as Curso),
        companyTag: this.normalizeCompanyTag(this.newCurso.companyTag),
        instructorIds: this.selectedInstructors
      };
      await this.cursoService.addCurso(cursoToAdd);
      this.resetForm();
      this.showForm = false;
      this.notificationService.success('Curso agregado exitosamente');
    } catch (error) {
      console.error('Error agregando curso:', error);
      this.notificationService.error('Error al agregar curso');
    }
  }

  startEdit(curso: Curso) {
    if (!this.isAdmin) return;

    this.editingId = curso.idcurso || null;
    this.editingCurso = { ...curso };
    this.editingInstructors = [...(curso.instructorIds || [])];
    this.showForm = true;
  }

  async updateCurso() {
    if (!this.isAdmin || !this.editingId) return;

    if (!this.editingCurso.companyTag || !this.editingCurso.companyTag.trim()) {
      this.notificationService.warning('La etiqueta de empresa es requerida');
      return;
    }

    if (!this.editingInstructors || this.editingInstructors.length < 3) {
      this.notificationService.warning('Debes seleccionar minimo 3 instructores para el curso');
      return;
    }

    try {
      const cursoToUpdate: Partial<Curso> = {
        ...this.editingCurso,
        companyTag: this.normalizeCompanyTag(this.editingCurso.companyTag),
        instructorIds: this.editingInstructors
      };
      await this.cursoService.updateCurso(this.editingId, cursoToUpdate);
      this.resetForm();
      this.notificationService.success('Curso actualizado exitosamente');
    } catch (error) {
      console.error('Error actualizando curso:', error);
      this.notificationService.error('Error al actualizar curso');
    }
  }

  async deleteCurso(id: string | undefined) {
    if (!this.isAdmin || !id) return;

    if (confirm('Estas seguro de eliminar este curso?')) {
      try {
        await this.cursoService.deleteCurso(id);
        this.notificationService.success('Curso eliminado exitosamente');
      } catch (error) {
        console.error('Error eliminando curso:', error);
        this.notificationService.error('Error al eliminar curso');
      }
    }
  }

  resetForm() {
    this.newCurso = {
      nombre: '',
      descripcion: '',
      Fecha_inicio: undefined,
      Fecha_fin: undefined,
      nom_representante: '',
      num_represnetantes: '',
      companyTag: '',
      instructorIds: []
    };

    this.editingCurso = {
      nombre: '',
      descripcion: '',
      Fecha_inicio: undefined,
      Fecha_fin: undefined,
      nom_representante: '',
      num_represnetantes: '',
      companyTag: '',
      instructorIds: []
    };

    this.selectedInstructors = [];
    this.editingInstructors = [];
    this.editingId = null;
    this.showForm = false;
  }

  getInstructorName(instructorId: string): string {
    const instructor = this.instructores.find((i) => i.id === instructorId);
    return instructor ? instructor.nombre : 'Instructor no encontrado';
  }

  getCurrentInstructors(): string[] {
    return this.editingId ? this.editingInstructors : this.selectedInstructors;
  }

  formatDate(date: Date | string | null | undefined): string | null {
    if (!date) return null;
    const d = new Date(date);
    return d.toISOString().split('T')[0];
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
        return byUserAssignment || byInstructorProfile;
      });
      return;
    }

    this.cursos = [];
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
      return `Reporte de Cursos - Empresa: ${this.currentUser.companyTag}`;
    }
    return 'Reporte General de Cursos';
  }

  get filteredCursos(): Curso[] {
    const term = this.normalizeSearch(this.searchTerm);
    const tagTerm = this.normalizeSearch(this.tagSearchTerm);
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

    return [...filtered].sort((a, b) => this.compareCursos(a, b));
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
}
