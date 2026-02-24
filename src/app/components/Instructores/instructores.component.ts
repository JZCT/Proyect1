import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Instructor } from '../../models/instructor.model';

@Component({
  selector: 'app-instructor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './instructores.component.html',
  styleUrls: ['./instructores.component.scss']
})
export class InstructorComponent {

  defaultImg = 'assets/user-default.png';

  instructores: Instructor[] = [
    {
      nombre: 'Juan Pérez',
      telefono: '+52 442 123 4567',
      foto: '',
      asignado: true
    },
    {
      nombre: 'María López',
      telefono: '+52 442 987 6543',
      foto: '',
      asignado: false
    }
  ];

  // ✅ VARIABLES QUE FALTABAN
  editIndex: number | null = null;

  nuevoInstructor: Instructor = {
    nombre: '',
    telefono: '',
    foto: '',
    asignado: false
  };

  /* =====================
      GUARDAR / AGREGAR
  ===================== */
  guardarInstructor() {

    if (!this.nuevoInstructor.nombre || !this.nuevoInstructor.telefono) {
      alert('Completa los campos');
      return;
    }

    if (this.editIndex !== null) {
      this.instructores[this.editIndex] = { ...this.nuevoInstructor };
      alert('Instructor actualizado ✅');
    } else {
      this.instructores.push({ ...this.nuevoInstructor });
      alert('Instructor agregado ✅');
    }

    this.cancelar();
  }

  /* =====================
      EDITAR
  ===================== */
  editarInstructor(index: number) {
    this.editIndex = index;
    this.nuevoInstructor = { ...this.instructores[index] };
  }

  /* =====================
      ELIMINAR
  ===================== */
  eliminarInstructor(index: number) {

    const confirmar = confirm(
      `¿Eliminar a ${this.instructores[index].nombre}?`
    );

    if (confirmar) {
      this.instructores.splice(index, 1);
    }
  }

  /* =====================
      CANCELAR
  ===================== */
  cancelar() {
    this.editIndex = null;
    this.nuevoInstructor = {
      nombre: '',
      telefono: '',
      foto: '',
      asignado: false
    };
  }

  /* =====================
      IMAGEN
  ===================== */
  seleccionarImagen(event: Event) {

    const input = event.target as HTMLInputElement;

    if (!input.files?.length) return;

    const file = input.files[0];

    const reader = new FileReader();

    reader.onload = () => {
      this.nuevoInstructor.foto = reader.result as string;
    };

    reader.readAsDataURL(file);
  }

  onImgError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.onerror = null;
    img.src = this.defaultImg;
  }
}