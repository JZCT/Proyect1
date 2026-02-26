import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PersonaService } from '../../services/persona.service';
import { AuthService } from '../../services/auth.service';
import { Persona } from '../../models/persona.model';

@Component({
  selector: 'app-personas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './personas.component.html',
  styleUrl: './personas.component.scss'
})
export class PersonasComponent implements OnInit {
  @ViewChild('photoInput') photoInput!: ElementRef<HTMLInputElement>;
  
  personas: Persona[] = [];
  showForm = false;
  editingId: string | null = null; // Cambiado a string
  loadingFile = false;
  isAdmin = false;

  newPersona: Partial<Persona> = {
    nombre: '',
    email: '',
    telefono: '',
    empresa: '',
    foto: '',
    archivos: []
  };

  editingPersona: Partial<Persona> = {
    nombre: '',
    email: '',
    telefono: '',
    empresa: '',
    foto: '',
    archivos: []
  };

  constructor(
    private personaService: PersonaService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.checkAdminStatus();
    this.loadPersonas();
  }

  private checkAdminStatus() {
    this.authService.isAdmin().subscribe(isAdmin => {
      this.isAdmin = isAdmin;
    });
  }

  loadPersonas() {
    this.personaService.getPersonas().subscribe({
      next: (personas) => {
        this.personas = personas;
        console.log('Personas cargadas:', personas);
      },
      error: (error) => {
        console.error('Error cargando personas:', error);
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

  triggerCamera() {
    if (!this.isAdmin) {
      alert('No tienes permisos para realizar esta acción');
      return;
    }
    this.photoInput.nativeElement.click();
  }

  onPhotoSelected(event: any) {
    if (!this.isAdmin) return;

    const file = event.target.files[0];
    if (file) {
      this.loadingFile = true;
      
      // Convertir a base64 para almacenar (en producción usarías Firebase Storage)
      const reader = new FileReader();
      reader.onload = (e: any) => {
        const base64 = e.target.result;
        
        if (this.editingId) {
          this.editingPersona.foto = base64;
        } else {
          this.newPersona.foto = base64;
        }
        
        this.loadingFile = false;
      };
      reader.readAsDataURL(file);
    }
  }

  onFilesSelected(event: any) {
    if (!this.isAdmin) return;

    const files = event.target.files;
    if (files.length > 0) {
      this.loadingFile = true;
      
      // Aquí deberías subir los archivos a Firebase Storage
      // Por ahora solo simulamos
      setTimeout(() => {
        const archivos = Array.from(files).map(f => ({
          nombre: (f as File).name,
          url: URL.createObjectURL(f as Blob),
          tipo: (f as File).type
        }));
        
        if (this.editingId) {
          this.editingPersona.archivos = [
            ...(this.editingPersona.archivos || []),
            ...archivos
          ];
        } else {
          this.newPersona.archivos = [
            ...(this.newPersona.archivos || []),
            ...archivos
          ];
        }
        
        this.loadingFile = false;
      }, 1000);
    }
  }

  getFotoUrl(foto: string | undefined): string {
    return foto || 'assets/default-avatar.png';
  }

  async addPersona() {
    if (!this.isAdmin) return;

    if (!this.newPersona.nombre || !this.newPersona.email) {
      alert('Nombre y email son requeridos');
      return;
    }

    try {
      await this.personaService.addPersona(this.newPersona as Persona);
      this.resetForm();
      this.showForm = false;
    } catch (error) {
      console.error('Error agregando persona:', error);
      alert('Error al agregar persona');
    }
  }

  startEdit(persona: Persona) {
    if (!this.isAdmin) return;

    this.editingId = persona.id || null;
    this.editingPersona = { ...persona };
    this.showForm = true;
  }

  async updatePersona() {
    if (!this.isAdmin || !this.editingId) return;

    try {
      await this.personaService.updatePersona(
        this.editingId,
        this.editingPersona as Persona
      );
      this.resetForm();
    } catch (error) {
      console.error('Error actualizando persona:', error);
      alert('Error al actualizar persona');
    }
  }

  async deletePersona(id: string | undefined) {
    if (!this.isAdmin || !id) return;

    if (confirm('¿Estás seguro de eliminar esta persona?')) {
      try {
        await this.personaService.deletePersona(id);
      } catch (error) {
        console.error('Error eliminando persona:', error);
        alert('Error al eliminar persona');
      }
    }
  }

  resetForm() {
    this.newPersona = {
      nombre: '',
      email: '',
      telefono: '',
      empresa: '',
      foto: '',
      archivos: []
    };
    
    this.editingPersona = {
      nombre: '',
      email: '',
      telefono: '',
      empresa: '',
      foto: '',
      archivos: []
    };
    
    this.editingId = null;
    this.showForm = false;
  }
}