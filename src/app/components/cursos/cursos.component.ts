import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CursoService } from '../../services/curso.service';
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
  newCurso: Curso = { nombre: '', descripcion: '',  Fecha_inicio: undefined, Fecha_fin: undefined, nom_representante: '', num_represnetantes: "" };
  editingId: number | null = null;
  editingCurso: Curso = { nombre: '', descripcion: '',  Fecha_inicio: undefined, Fecha_fin: undefined, nom_representante: '', num_represnetantes: "" };
  showForm = false;

  formatDate(date: Date | string | null | undefined): string | null {
    if (!date) return null;
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  constructor(private cursoService: CursoService) {}

  ngOnInit() {
    this.cursoService.getCursos().subscribe(cursos => {
      this.cursos = cursos;
    });
  }

  toggleForm() {
    this.showForm = !this.showForm;
    if (!this.showForm) {
      this.resetForm();
    }
  }

  addCurso() {
    if (this.newCurso.nombre 
      && this.newCurso.descripcion
       && this.newCurso.Fecha_inicio
        && this.newCurso.Fecha_fin
         && this.newCurso.nom_representante
          && this.newCurso.num_represnetantes) {
      this.cursoService.addCurso({ ...this.newCurso });
      this.resetForm();
    }
  }

  startEdit(curso: Curso) {
    this.editingId = curso.id || null;
    this.editingCurso = { ...curso };
    this.showForm = true;
  }

  updateCurso() {
    if (this.editingId && this.editingCurso.nombre 
      && this.editingCurso.descripcion 
      && this.editingCurso.nom_representante) {
      this.cursoService.updateCurso(this.editingId, this.editingCurso);
      this.resetForm();
    }
  }

  deleteCurso(id: number | undefined) {
    if (id && confirm('¿Estás seguro de eliminar este curso?')) {
      this.cursoService.deleteCurso(id);
    }
  }

  resetForm() {
    this.newCurso = { nombre: '', descripcion: '',  Fecha_inicio: undefined, Fecha_fin: undefined, nom_representante: '', num_represnetantes: '' };
    this.editingId = null;
    this.editingCurso = { nombre: '', descripcion: '',  Fecha_inicio: undefined, Fecha_fin: undefined, nom_representante: '', num_represnetantes: '' };
    this.showForm = false;
  }
}
