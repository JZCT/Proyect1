import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import { PersonaService } from '../../services/persona.service';
import { AuthService } from '../../services/auth.service';
import { CursoService } from '../../services/curso.service';
import { NotificationService } from '../../services/notification.service';
import { Persona } from '../../models/persona.model';
import { Curso } from '../../models/curso.model';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-personas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './personas.component.html',
  styleUrl: './personas.component.scss'
})
export class PersonasComponent implements OnInit {
  @ViewChild('photoInput') photoInput!: ElementRef<HTMLInputElement>;
  @ViewChild('excelInput') excelInput!: ElementRef<HTMLInputElement>;
  
  personas: Persona[] = [];
  cursos: Curso[] = [];
  showForm = false;
  editingId: string | null = null;
  loadingFile = false;
  
  importProgress = 0;
  importResult: { success: number; errors: string[] } | null = null;
  
  showCityAssignment = false;
  selectedCity: string | null = null;
  selectedCursoId: string | null = null;
  loadingAssignment = false;
  
  currentUser: User | null = null;
  isAdmin = false;
  isInstructor = false;
  isCompany = false;

  newPersona: Partial<Persona> = {
    nombre: '',
    email: '',
    telefono: '',
    empresa: '',
    ciudad: '',
    foto: '',
    archivos: []
  };

  editingPersona: Partial<Persona> = {
    nombre: '',
    email: '',
    telefono: '',
    empresa: '',
    ciudad: '',
    foto: '',
    archivos: []
  };

  constructor(
    private personaService: PersonaService,
    private cursoService: CursoService,
    private authService: AuthService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.loadCurrentUser();
    this.loadPersonas();
    this.loadCursos();
  }

  private loadCurrentUser() {
    this.authService.currentUser$.subscribe(async (firebaseUser) => {
      if (firebaseUser) {
        const userData = await this.authService.getUserData(firebaseUser.uid);
        this.currentUser = userData;
        this.isAdmin = userData?.role === 'admin';
        this.isInstructor = userData?.role === 'instructor';
        this.isCompany = userData?.role === 'company';
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
        this.notificationService.showError('Error al cargar los cursos');
      }
    });
  }

  get availableCities(): string[] {
    const cities = this.personas
      .map(p => p.ciudad)
      .filter((c): c is string => !!c && c.trim() !== '');
    return [...new Set(cities)].sort();
  }

  getPersonasPorCiudad(ciudad: string): Persona[] {
    return this.personas.filter(p => p.ciudad === ciudad);
  }

  // ========== MÉTODOS DE PERMISOS ==========
  canCreatePersona(): boolean {
    return this.isAdmin || this.isInstructor;
  }

  canEditPersona(): boolean {
    return this.isAdmin || this.isInstructor;
  }

  canDeletePersona(): boolean {
    return this.isAdmin || this.isInstructor;
  }

  canViewPersona(): boolean {
    return true;
  }

  loadPersonas() {
    this.personaService.getPersonas().subscribe({
      next: (personas) => {
        this.personas = personas;
        console.log('Personas cargadas:', personas);
      },
      error: (error) => {
        console.error('Error cargando personas:', error);
        this.notificationService.showError('Error al cargar las personas');
      }
    });
  }

  toggleForm() {
    if (!this.canCreatePersona()) {
      this.notificationService.showError('No tienes permisos para realizar esta acción');
      return;
    }
    this.showForm = !this.showForm;
    if (!this.showForm) {
      this.resetForm();
    }
  }

  // ========== IMPORTACIÓN EXCEL ==========
  triggerFileUpload() {
    this.excelInput.nativeElement.click();
  }

  async onExcelSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    this.loadingFile = true;
    this.importProgress = 0;
    this.importResult = null;

    try {
      const data = await this.readExcelFile(file);
      const personas = this.parseExcelToPersonas(data);
      
      await this.importPersonas(personas);
      await this.loadPersonas();
      
      this.notificationService.showSuccess(`✅ Importación completada: ${personas.length} personas procesadas`);
    } catch (error) {
      console.error('Error importing Excel:', error);
      this.notificationService.showError('Error al procesar el archivo Excel');
      this.importResult = {
        success: 0,
        errors: ['Error al procesar el archivo Excel: ' + error]
      };
    } finally {
      this.loadingFile = false;
      this.importProgress = 100;
      event.target.value = '';
    }
  }

  private readExcelFile(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e: any) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  }

  private parseExcelToPersonas(data: any[]): Partial<Persona>[] {
    if (data.length < 2) {
      throw new Error('El archivo Excel no contiene datos válidos');
    }

    const headers = data[0] as string[];
    const rows = data.slice(1) as any[][];
    
    const columnMap: { [key: string]: number } = {};
    headers.forEach((header, index) => {
      const headerLower = String(header || '').toLowerCase().trim();
      if (headerLower.includes('nombre') || headerLower.includes('name')) {
        columnMap['nombre'] = index;
      } else if (headerLower.includes('email') || headerLower.includes('correo')) {
        columnMap['email'] = index;
      } else if (headerLower.includes('tel') || headerLower.includes('phone')) {
        columnMap['telefono'] = index;
      } else if (headerLower.includes('empresa') || headerLower.includes('company')) {
        columnMap['empresa'] = index;
      } else if (headerLower.includes('ciudad') || headerLower.includes('city')) {
        columnMap['ciudad'] = index;
      }
    });

    if (!columnMap['nombre'] || !columnMap['email']) {
      throw new Error('El archivo debe contener columnas de Nombre y Email');
    }

    const personas: Partial<Persona>[] = [];
    const errors: string[] = [];

    rows.forEach((row, rowIndex) => {
      try {
        const persona: Partial<Persona> = {
          nombre: row[columnMap['nombre']]?.toString().trim() || '',
          email: row[columnMap['email']]?.toString().trim() || '',
          telefono: columnMap['telefono'] !== undefined ? row[columnMap['telefono']]?.toString().trim() : '',
          empresa: columnMap['empresa'] !== undefined ? row[columnMap['empresa']]?.toString().trim() : '',
          ciudad: columnMap['ciudad'] !== undefined ? row[columnMap['ciudad']]?.toString().trim() : '',
          archivos: []
        };

        if (!persona.nombre || !persona.email) {
          errors.push(`Fila ${rowIndex + 2}: Nombre y Email son requeridos`);
        } else {
          personas.push(persona);
        }
      } catch (error) {
        errors.push(`Fila ${rowIndex + 2}: Error al procesar - ${error}`);
      }
    });

    if (errors.length > 0) {
      console.warn('Errores en la importación:', errors);
      this.importResult = { success: personas.length, errors };
    }

    return personas;
  }

  private async importPersonas(personas: Partial<Persona>[]) {
    let successCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < personas.length; i++) {
      try {
        this.importProgress = Math.round((i / personas.length) * 100);
        
        const persona = personas[i];
        const existingPersona = this.personas.find(p => 
          p.email?.toLowerCase() === persona.email?.toLowerCase()
        );

        if (existingPersona) {
          await this.personaService.updatePersona(existingPersona.id!, {
            ...existingPersona,
            ...persona,
            updatedAt: new Date()
          });
        } else {
          await this.personaService.addPersona({
            ...persona,
            cursoIds: [],
            createdAt: new Date(),
            updatedAt: new Date()
          } as Persona);
        }
        
        successCount++;
      } catch (error) {
        errors.push(`Persona ${i + 1}: ${error}`);
      }
    }

    this.importResult = {
      success: successCount,
      errors: errors
    };
  }

  // ========== ASIGNACIÓN POR CIUDAD ==========
  openCityAssignment() {
    this.showCityAssignment = true;
    this.selectedCity = null;
    this.selectedCursoId = null;
  }

  closeCityAssignment() {
    this.showCityAssignment = false;
  }

  async assignCityToCurso() {
    if (!this.selectedCity || !this.selectedCursoId) {
      this.notificationService.showWarning('Debes seleccionar una ciudad y un curso');
      return;
    }

    if (!this.canCreatePersona()) {
      this.notificationService.showError('No tienes permisos para realizar esta acción');
      return;
    }

    this.loadingAssignment = true;

    try {
      const personasEnCiudad = this.getPersonasPorCiudad(this.selectedCity);
      
      if (personasEnCiudad.length === 0) {
        this.notificationService.showWarning('No hay personas en la ciudad seleccionada');
        return;
      }

      let successCount = 0;
      const errors: string[] = [];

      for (const persona of personasEnCiudad) {
        try {
          await this.cursoService.addPersonaToCurso(this.selectedCursoId!, persona.id!);
          await this.personaService.assignToCurso(persona.id!, this.selectedCursoId!);
          successCount++;
        } catch (error) {
          errors.push(`${persona.nombre}: ${error}`);
        }
      }

      await this.loadPersonas();
      await this.loadCursos();

      this.notificationService.showSuccess(`✅ Se asignaron ${successCount} personas de ${this.selectedCity} al curso`);
      
      if (errors.length > 0) {
        console.warn('Errores en asignación:', errors);
      }

      this.closeCityAssignment();

    } catch (error) {
      console.error('Error asignando ciudad a curso:', error);
      this.notificationService.showError('Error al asignar personas al curso');
    } finally {
      this.loadingAssignment = false;
    }
  }

  // ========== MÉTODOS DE FOTO Y ARCHIVOS ==========
  triggerCamera() {
    if (!this.canCreatePersona()) {
      this.notificationService.showError('No tienes permisos para realizar esta acción');
      return;
    }
    this.photoInput.nativeElement.click();
  }

  onPhotoSelected(event: any) {
    if (!this.canCreatePersona()) return;

    const file = event.target.files[0];
    if (file) {
      this.loadingFile = true;
      
      const reader = new FileReader();
      reader.onload = (e: any) => {
        const base64 = e.target.result;
        
        if (this.editingId) {
          this.editingPersona.foto = base64;
        } else {
          this.newPersona.foto = base64;
        }
        
        this.loadingFile = false;
        this.notificationService.showSuccess('✅ Foto cargada exitosamente');
      };
      reader.readAsDataURL(file);
    }
  }

  onFilesSelected(event: any) {
    if (!this.canCreatePersona()) return;

    const files = event.target.files;
    if (files.length > 0) {
      this.loadingFile = true;
      
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
        this.notificationService.showSuccess(`✅ ${archivos.length} archivo(s) cargado(s)`);
      }, 1000);
    }
  }

  getFotoUrl(foto: string | undefined): string {
    return foto || 'assets/default-avatar.png';
  }

  async addPersona() {
    if (!this.canCreatePersona()) {
      this.notificationService.showError('No tienes permisos para agregar personas');
      return;
    }

    if (!this.newPersona.nombre || !this.newPersona.email) {
      this.notificationService.showWarning('Nombre y email son requeridos');
      return;
    }

    try {
      await this.personaService.addPersona(this.newPersona as Persona);
      this.resetForm();
      this.showForm = false;
      this.notificationService.showSuccess('✅ Persona agregada exitosamente');
      this.loadPersonas();
    } catch (error) {
      console.error('Error agregando persona:', error);
      this.notificationService.showError('❌ Error al agregar persona');
    }
  }

  startEdit(persona: Persona) {
    if (!this.canEditPersona()) {
      this.notificationService.showError('No tienes permisos para editar personas');
      return;
    }

    this.editingId = persona.id || null;
    this.editingPersona = { ...persona };
    this.showForm = true;
  }

  async updatePersona() {
    if (!this.canEditPersona() || !this.editingId) {
      this.notificationService.showError('No tienes permisos para editar personas');
      return;
    }

    try {
      await this.personaService.updatePersona(
        this.editingId,
        this.editingPersona as Persona
      );
      this.resetForm();
      this.notificationService.showSuccess('✅ Persona actualizada exitosamente');
      this.loadPersonas();
    } catch (error) {
      console.error('Error actualizando persona:', error);
      this.notificationService.showError('❌ Error al actualizar persona');
    }
  }

  async deletePersona(id: string | undefined) {
    if (!this.canDeletePersona() || !id) {
      this.notificationService.showError('No tienes permisos para eliminar personas');
      return;
    }

    if (confirm('¿Estás seguro de eliminar esta persona?')) {
      try {
        await this.personaService.deletePersona(id);
        this.notificationService.showSuccess('✅ Persona eliminada exitosamente');
        this.loadPersonas();
      } catch (error) {
        console.error('Error eliminando persona:', error);
        this.notificationService.showError('❌ Error al eliminar persona');
      }
    }
  }

  resetForm() {
    this.newPersona = {
      nombre: '',
      email: '',
      telefono: '',
      empresa: '',
      ciudad: '',
      foto: '',
      archivos: []
    };
    
    this.editingPersona = {
      nombre: '',
      email: '',
      telefono: '',
      empresa: '',
      ciudad: '',
      foto: '',
      archivos: []
    };
    
    this.editingId = null;
    this.showForm = false;
  }

  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement) {
      imgElement.src = 'assets/default-avatar.png';
    }
  }
}