import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PersonaService } from '../../services/persona.service';
import { Persona } from '../../models/persona.model';

@Component({
  selector: 'app-personas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './personas.component.html',
  styleUrl: './personas.component.scss'
})
export class PersonasComponent implements OnInit {
  personas: Persona[] = [];
  newPersona: Persona = { nombre: '', email: '', telefono: '' };
  editingId: number | null = null;
  editingPersona: Persona = { nombre: '', email: '', telefono: '' };
  showForm = false;

  constructor(private personaService: PersonaService) {}

  ngOnInit() {
    this.personaService.getPersonas().subscribe(personas => {
      this.personas = personas;
    });
  }

  toggleForm() {
    this.showForm = !this.showForm;
    if (!this.showForm) {
      this.resetForm();
    }
  }

  addPersona() {
    if (this.newPersona.nombre && this.newPersona.email && this.newPersona.telefono) {
      this.personaService.addPersona({ ...this.newPersona });
      this.resetForm();
    }
  }

  startEdit(persona: Persona) {
    this.editingId = persona.id || null;
    this.editingPersona = { ...persona };
    this.showForm = true;
  }

  updatePersona() {
    if (this.editingId && this.editingPersona.nombre && this.editingPersona.email) {
      this.personaService.updatePersona(this.editingId, this.editingPersona);
      this.resetForm();
    }
  }

  deletePersona(id: number | undefined) {
    if (id && confirm('¿Estás seguro de eliminar esta persona?')) {
      this.personaService.deletePersona(id);
    }
  }

  resetForm() {
    this.newPersona = { nombre: '', email: '', telefono: '' };
    this.editingId = null;
    this.editingPersona = { nombre: '', email: '', telefono: '' };
    this.showForm = false;
  }
}
