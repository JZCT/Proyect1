import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CursoService } from '../../services/curso.service';
import { AuthService } from '../../services/auth.service';
import { Curso } from '../../models/curso.model';

@Component({
  selector: 'app-cursos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cursos.component.html',
  styleUrl: './cursos.component.scss'
})
export class CursosComponent implements OnInit {
  cursos: Curso[] = [];
  showForm = false;
  editingId: string | null = null; // Cambiado a string
  isAdmin = false;

  newCurso: Partial<Curso> = {
    nombre: '',
    descripcion: '',
    Fecha_inicio: undefined,
    Fecha_fin: undefined,
    nom_representante: '',
    num_represnetantes: ''
  };

  editingCurso: Partial<Curso> = {
    nombre: '',
    descripcion: '',
    Fecha_inicio: undefined,
    Fecha_fin: undefined,
    nom_representante: '',
    num_represnetantes: ''
  };

  constructor(
    private cursoService: CursoService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.checkAdminStatus();
    this.loadCursos();
  }

  private checkAdminStatus() {
    this.authService.isAdmin().subscribe(isAdmin => {
      this.isAdmin = isAdmin;
    });
  }

  loadCursos() {
    this.cursoService.getCursos().subscribe({
      next: (cursos) => {
        this.cursos = cursos;
        console.log('Cursos cargados:', cursos);
      },
      error: (error) => {
        console.error('Error cargando cursos:', error);
      }
    });
  }

  toggleForm() {
    if (!this.isAdmin) {
      alert('No tienes permisos para realizar esta acción');
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
      alert('Nombre y descripción son requeridos');
      return;
    }

    try {
      await this.cursoService.addCurso(this.newCurso as Curso);
      this.resetForm();
      this.showForm = false;
      alert('Curso agregado exitosamente');
    } catch (error) {
      console.error('Error agregando curso:', error);
      alert('Error al agregar curso');
    }
  }

  startEdit(curso: Curso) {
    if (!this.isAdmin) return;

    this.editingId = curso.id || null;
    this.editingCurso = { ...curso };
    this.showForm = true;
  }

  async updateCurso() {
    if (!this.isAdmin || !this.editingId) return;

    try {
      await this.cursoService.updateCurso(this.editingId, this.editingCurso as Curso);
      this.resetForm();
      alert('Curso actualizado exitosamente');
    } catch (error) {
      console.error('Error actualizando curso:', error);
      alert('Error al actualizar curso');
    }
  }

  async deleteCurso(id: string | undefined) {
    if (!this.isAdmin || !id) return;

    if (confirm('¿Estás seguro de eliminar este curso?')) {
      try {
        await this.cursoService.deleteCurso(id);
        alert('Curso eliminado exitosamente');
      } catch (error) {
        console.error('Error eliminando curso:', error);
        alert('Error al eliminar curso');
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
      num_represnetantes: ''
    };
    
    this.editingCurso = {
      nombre: '',
      descripcion: '',
      Fecha_inicio: undefined,
      Fecha_fin: undefined,
      nom_representante: '',
      num_represnetantes: ''
    };
    
    this.editingId = null;
    this.showForm = false;
  }

  formatDate(date: Date | string | null | undefined): string | null {
    if (!date) return null;
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  }
}