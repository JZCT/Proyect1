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
  showForm = false;
  editingId: string | null = null; // Cambiado a string para Firestore IDs

  // Objeto inicializador para evitar repetición de código
  private initialPersonaState = (): Persona => ({
    nombre: '',
    email: '',
    telefono: '',
    empresa: '',
    foto: '',
    archivos: [],
    estado: true
  });

  newPersona: Persona = this.initialPersonaState();
  editingPersona: Persona = this.initialPersonaState();

  // Para mostrar la imagen inmediatamente antes de que termine de subir a Firebase
  previewImage: string | ArrayBuffer | null = null;
  loadingFile = false;

  constructor(private personaService: PersonaService) {}

  ngOnInit() {
    this.personaService.getPersonas().subscribe(personas => {
      this.personas = personas;
    });
  }

  // Retorna la URL de la foto, la vista previa local o la de defecto
  getFotoUrl(url: string | undefined): string {
    if (this.previewImage && this.showForm) return this.previewImage as string;
    return (url && url.trim() !== '') ? url : 'assets/user-default.png';
  }

  // Captura foto (cámara) o sube archivo de imagen
  async onPhotoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.loadingFile = true;

      // 1. Mostrar vista previa local (inmediato)
      const reader = new FileReader();
      reader.onload = () => { this.previewImage = reader.result; };
      reader.readAsDataURL(file);

      // 2. Subir a Firebase Storage
      try {
        const downloadURL = await this.personaService.uploadFile(file);
        if (this.editingId) {
          this.editingPersona.foto = downloadURL;
        } else {
          this.newPersona.foto = downloadURL;
        }
      } catch (error) {
        console.error("Error al subir imagen:", error);
        alert("No se pudo subir la imagen");
      } finally {
        this.loadingFile = false;
      }
    }
  }

  // Maneja la subida de múltiples archivos adjuntos
  async onFilesSelected(event: any) {
    const files: FileList = event.target.files;
    if (files.length > 0) {
      this.loadingFile = true;
      try {
        for (let i = 0; i < files.length; i++) {
          const downloadURL = await this.personaService.uploadFile(files[i]);
          const target = this.editingId ? this.editingPersona : this.newPersona;
          target.archivos = [...(target.archivos || []), downloadURL];
        }
      } catch (error) {
        console.error("Error al subir archivos:", error);
      } finally {
        this.loadingFile = false;
      }
    }
  }

  toggleForm() {
    this.showForm = !this.showForm;
    if (!this.showForm) this.resetForm();
  }

  async addPersona() {
    if (this.newPersona.nombre && this.newPersona.email) {
      try {
        await this.personaService.addPersona({ ...this.newPersona });
        this.resetForm();
      } catch (error) {
        console.error("Error al guardar:", error);
      }
    }
  }

  startEdit(persona: Persona) {
    this.editingId = persona.id?.toString() || null;
    this.editingPersona = { ...persona, archivos: persona.archivos || [] };
    this.showForm = true;
  }

  async updatePersona() {
    if (this.editingId) {
      try {
        await this.personaService.updatePersona(this.editingId, this.editingPersona);
        this.resetForm();
      } catch (error) {
        console.error("Error al actualizar:", error);
      }
    }
  }

  async deletePersona(id: string | number | undefined) {
    if (id && confirm('¿Estás seguro de eliminar esta persona?')) {
      try {
        await this.personaService.deletePersona(id.toString());
      } catch (error) {
        console.error("Error al eliminar:", error);
      }
    }
  }

  resetForm() {
    this.newPersona = this.initialPersonaState();
    this.editingPersona = this.initialPersonaState();
    this.editingId = null;
    this.showForm = false;
    this.previewImage = null;
    this.loadingFile = false;
  }
}