import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PersonaService } from '../../services/persona.service';
import { AuthService } from '../../services/auth.service';
import { ImportService } from '../../services/import.service';
import { ReportService } from '../../services/report.service';
import { Persona } from '../../models/persona.model';

type PersonaArchivo = NonNullable<Persona['archivos']>[number];

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
  private readonly MIN_CALIFICACION_APTO = 80;
  private readonly CURP_REGEX = /^[A-Z0-9]{18}$/;
  
  personas: Persona[] = [];
  showForm = false;
  editingId: string | null = null;
  loadingFile = false;
  isAdmin = false;
  searchTerm: string = '';
  selectedPersonaIds = new Set<string>();
  deletingSelected = false;

  // Propiedades para carga masiva
  showBulkImport = false;
  bulkPersonas: Persona[] = [];
  bulkImportLoading = false;
  bulkImportProgress = 0;
  bulkImportError = '';
  selectedExcelFileName = '';

  // Propiedades para reportes
  showReports = false;
  reportFilter = {
    tipo: 'all', // all, empresa, lugar
    empresa: '',
    lugar: ''
  };
  empresas: string[] = [];
  lugares: string[] = [];

  newPersona: Partial<Persona> = {
    nombre: '',
    curp: '',
    email: '',
    telefono: '',
    empresa: '',
    lugar: '',
    clfPractica: undefined,
    clfTeorica: undefined,
    foto: '',
    archivos: []
  };

  editingPersona: Partial<Persona> = {
    nombre: '',
    curp: '',
    email: '',
    telefono: '',
    empresa: '',
    lugar: '',
    clfPractica: undefined,
    clfTeorica: undefined,
    foto: '',
    archivos: []
  };

  constructor(
    private personaService: PersonaService,
    private authService: AuthService,
    private importService: ImportService,
    private reportService: ReportService
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
        this.syncSelectionWithCurrentData();
        this.updateFilterOptions();
        console.log('Personas cargadas:', personas);
      },
      error: (error) => {
        console.error('Error cargando personas:', error);
      }
    });
  }

  private updateFilterOptions() {
    // Extraer empresas y lugares únicos
    const toArray = (items: (string | undefined)[]): string[] => {
      return [...new Set(items.filter((item): item is string => item !== undefined))];
    };
    
    this.empresas = toArray(this.personas.map(p => p.empresa)).sort();
    this.lugares = toArray(this.personas.map(p => p.lugar)).sort();
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

  onFilesSelected(event: Event) {
    if (!this.isAdmin) return;

    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) return;

    this.loadingFile = true;

    const archivos = Array.from(files).map((file) => ({
      nombre: file.name,
      url: URL.createObjectURL(file),
      tipo: file.type
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

    input.value = '';
    this.loadingFile = false;
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

    const newCurp = this.normalizeCurp(this.newPersona.curp);
    if (!newCurp) {
      alert('CURP es requerida');
      return;
    }

    if (!this.isValidCurp(newCurp)) {
      alert('CURP no es valida. Debe tener 18 caracteres alfanumericos');
      return;
    }

    try {
      const personaToSave = this.preparePersonaForSave(this.newPersona);
      await this.personaService.addPersona(personaToSave as Persona);
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
    this.editingPersona = {
      ...persona,
      curp: this.normalizeCurp(persona.curp)
    };
    this.showForm = true;
  }

  async updatePersona() {
    if (!this.isAdmin || !this.editingId) return;

    const editCurp = this.normalizeCurp(this.editingPersona.curp);
    if (!editCurp) {
      alert('CURP es requerida');
      return;
    }

    if (!this.isValidCurp(editCurp)) {
      alert('CURP no es valida. Debe tener 18 caracteres alfanumericos');
      return;
    }

    try {
      const personaToUpdate = this.preparePersonaForSave(this.editingPersona);
      await this.personaService.updatePersona(
        this.editingId,
        personaToUpdate as Persona
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
        this.selectedPersonaIds.delete(id);
      } catch (error) {
        console.error('Error eliminando persona:', error);
        alert('Error al eliminar persona');
      }
    }
  }

  get selectedCount(): number {
    return this.selectedPersonaIds.size;
  }

  isSelected(id: string | undefined): boolean {
    return !!id && this.selectedPersonaIds.has(id);
  }

  isAllFilteredSelected(): boolean {
    const visibleIds = this.getVisibleIds();
    return visibleIds.length > 0 && visibleIds.every(id => this.selectedPersonaIds.has(id));
  }

  isPartiallyFilteredSelected(): boolean {
    const visibleIds = this.getVisibleIds();
    if (visibleIds.length === 0) return false;

    const selectedVisibleCount = visibleIds.filter(id => this.selectedPersonaIds.has(id)).length;
    return selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
  }

  toggleSelection(id: string | undefined, event: Event): void {
    if (!id) return;

    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      this.selectedPersonaIds.add(id);
      return;
    }

    this.selectedPersonaIds.delete(id);
  }

  toggleSelectAllFiltered(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const visibleIds = this.getVisibleIds();

    if (checked) {
      visibleIds.forEach(id => this.selectedPersonaIds.add(id));
      return;
    }

    visibleIds.forEach(id => this.selectedPersonaIds.delete(id));
  }

  selectVisible(): void {
    this.getVisibleIds().forEach(id => this.selectedPersonaIds.add(id));
  }

  clearSelection(): void {
    this.selectedPersonaIds.clear();
  }

  async deleteSelectedPersonas(): Promise<void> {
    if (!this.isAdmin || this.selectedCount === 0 || this.deletingSelected) return;

    const confirmed = confirm(
      `Se eliminaran ${this.selectedCount} personas seleccionadas. Esta accion no se puede deshacer. ¿Continuar?`
    );
    if (!confirmed) return;

    this.deletingSelected = true;
    const idsToDelete = [...this.selectedPersonaIds];

    try {
      await this.personaService.deletePersonas(idsToDelete);
      this.clearSelection();
      alert(`Se eliminaron ${idsToDelete.length} personas`);
    } catch (error) {
      console.error('Error eliminando personas seleccionadas:', error);
      alert('Error al eliminar personas seleccionadas');
    } finally {
      this.deletingSelected = false;
    }
  }

  resetForm() {
    this.revokeObjectUrls(this.newPersona.archivos as PersonaArchivo[] | undefined);
    this.revokeObjectUrls(this.editingPersona.archivos as PersonaArchivo[] | undefined);

    this.newPersona = {
      nombre: '',
      curp: '',
      email: '',
      telefono: '',
      empresa: '',
      lugar: '',
      clfPractica: undefined,
      clfTeorica: undefined,
      foto: '',
      archivos: []
    };
    
    this.editingPersona = {
      nombre: '',
      curp: '',
      email: '',
      telefono: '',
      empresa: '',
      lugar: '',
      clfPractica: undefined,
      clfTeorica: undefined,
      foto: '',
      archivos: []
    };
    
    this.editingId = null;
    this.showForm = false;
  }

  getCurrentArchivos(): PersonaArchivo[] {
    return (this.editingId ? this.editingPersona.archivos : this.newPersona.archivos) || [];
  }

  isImageFile(tipo: string | undefined): boolean {
    return !!tipo?.startsWith('image/');
  }

  openArchivo(file: PersonaArchivo): void {
    if (!file?.url) return;
    window.open(file.url, '_blank', 'noopener,noreferrer');
  }

  removeArchivo(index: number): void {
    const source = this.editingId ? this.editingPersona : this.newPersona;
    const archivos = [...(source.archivos || [])];
    const [removed] = archivos.splice(index, 1);

    if (removed?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(removed.url);
    }

    source.archivos = archivos;
  }

  getCalificacionFinal(persona: Partial<Persona>): number | null {
    const practica = this.getValidScore(persona.clfPractica);
    const teorica = this.getValidScore(persona.clfTeorica);

    if (practica === null || teorica === null) {
      return null;
    }

    return Math.round(((practica + teorica) / 2) * 10) / 10;
  }

  getResultadoTexto(persona: Partial<Persona>): string {
    const calificacionFinal = this.getCalificacionFinal(persona);
    if (calificacionFinal === null) return 'Sin evaluar';
    return calificacionFinal >= this.MIN_CALIFICACION_APTO ? 'Apto' : 'No apto';
  }

  getResultadoClase(persona: Partial<Persona>): string {
    const resultado = this.getResultadoTexto(persona);
    if (resultado === 'Apto') return 'status-apto';
    if (resultado === 'No apto') return 'status-no-apto';
    return 'status-sin-evaluar';
  }

  formatCalificacion(value: unknown): string {
    const score = this.getValidScore(value);
    return score === null ? '-' : score.toFixed(1);
  }

  private preparePersonaForSave(persona: Partial<Persona>): Partial<Persona> {
    return {
      ...persona,
      curp: this.normalizeCurp(persona.curp),
      clfPractica: this.normalizeScoreForStorage(persona.clfPractica),
      clfTeorica: this.normalizeScoreForStorage(persona.clfTeorica)
    };
  }

  private normalizeScoreForStorage(value: unknown): number | undefined {
    const score = this.getValidScore(value);
    return score === null ? undefined : score;
  }

  private getValidScore(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) return null;
    return Math.max(0, Math.min(100, numericValue));
  }

  private revokeObjectUrls(archivos: PersonaArchivo[] | undefined): void {
    if (!archivos?.length) return;

    for (const archivo of archivos) {
      if (archivo.url?.startsWith('blob:')) {
        URL.revokeObjectURL(archivo.url);
      }
    }
  }

  // ==================== CARGA MASIVA ====================

  triggerBulkImport() {
    if (!this.isAdmin) {
      alert('No tienes permisos para realizar esta accion');
      return;
    }

    this.bulkImportError = '';
    this.bulkImportProgress = 0;
    this.bulkPersonas = [];
    this.selectedExcelFileName = '';
    this.showBulkImport = true;

    const input = this.excelInput.nativeElement;
    input.value = '';
    input.click();
  }

  async onExcelSelected(event: Event) {
    if (!this.isAdmin) return;

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      this.selectedExcelFileName = file.name;
      this.showBulkImport = true;
      this.bulkImportLoading = true;
      this.bulkImportError = '';
      this.bulkPersonas = await this.importService.parseExcelFile(file);
      
      if (this.bulkPersonas.length === 0) {
        this.bulkImportError = 'El archivo no contiene datos validos';
        this.bulkImportLoading = false;
        return;
      }
    } catch (error: any) {
      this.bulkImportError = error.message || 'Error al procesar el archivo Excel';
      console.error('Error en carga masiva:', error);
    } finally {
      this.bulkImportLoading = false;
    }
  }

  async confirmBulkImport() {
    if (!this.isAdmin || this.bulkPersonas.length === 0) return;

    this.bulkImportLoading = true;
    this.bulkImportError = '';
    this.bulkImportProgress = 0;

    try {
      const total = this.bulkPersonas.length;
      
      for (let i = 0; i < this.bulkPersonas.length; i++) {
        try {
          await this.personaService.addPersona({
            ...this.bulkPersonas[i],
            createdAt: new Date()
          } as Persona);
          
          this.bulkImportProgress = Math.round(((i + 1) / total) * 100);
        } catch (error) {
          console.warn(`Error agregando persona ${i + 1}:`, error);
        }
      }

      this.loadPersonas();
      this.bulkPersonas = [];
      this.showBulkImport = false;
      alert(`✅ Se importaron exitosamente ${this.bulkImportProgress === 100 ? 'todas' : 'la mayoría de'} las personas`);
    } catch (error: any) {
      this.bulkImportError = error.message || 'Error durante la importación masiva';
      console.error('Error en importación masiva:', error);
    } finally {
      this.bulkImportLoading = false;
      this.bulkImportProgress = 0;
    }
  }

  cancelBulkImport() {
    this.showBulkImport = false;
    this.bulkPersonas = [];
    this.bulkImportError = '';
    this.bulkImportProgress = 0;
    this.selectedExcelFileName = '';
  }

  async downloadTemplate() {
    try {
      this.bulkImportLoading = true;
      await this.importService.generateTemplate();
    } catch (error) {
      console.error('Error generando plantilla:', error);
      alert('Error al generar plantilla');
    } finally {
      this.bulkImportLoading = false;
    }
  }

  // ==================== REPORTES ====================

  toggleReports() {
    if (!this.isAdmin) {
      alert('No tienes permisos para generar reportes');
      return;
    }
    this.showReports = !this.showReports;
  }

  async generateReport() {
    if (!this.isAdmin) return;

    try {
      const filter: any = {};
      
      if (this.reportFilter.tipo === 'empresa' && this.reportFilter.empresa) {
        filter.empresa = this.reportFilter.empresa;
      } else if (this.reportFilter.tipo === 'lugar' && this.reportFilter.lugar) {
        filter.lugar = this.reportFilter.lugar;
      }

      const reportData = this.reportService.generateReportData(this.personas, filter);
      
      alert(`📊 Reporte generado: ${reportData.totalPersonas} personas`);
    } catch (error: any) {
      console.error('Error generando reporte:', error);
      alert('Error al generar reporte');
    }
  }

  async exportReportCSV() {
    if (!this.isAdmin) return;

    try {
      const filter: any = {};
      
      if (this.reportFilter.tipo === 'empresa' && this.reportFilter.empresa) {
        filter.empresa = this.reportFilter.empresa;
      } else if (this.reportFilter.tipo === 'lugar' && this.reportFilter.lugar) {
        filter.lugar = this.reportFilter.lugar;
      }

      const reportData = this.reportService.generateReportData(this.personas, filter);
      this.reportService.exportToCSV(reportData);
    } catch (error: any) {
      console.error('Error exportando CSV:', error);
      alert('Error al exportar reporte');
    }
  }

  async exportReportExcel() {
    if (!this.isAdmin) return;

    try {
      const filter: any = {};
      
      if (this.reportFilter.tipo === 'empresa' && this.reportFilter.empresa) {
        filter.empresa = this.reportFilter.empresa;
      } else if (this.reportFilter.tipo === 'lugar' && this.reportFilter.lugar) {
        filter.lugar = this.reportFilter.lugar;
      }

      const reportData = this.reportService.generateReportData(this.personas, filter);
      await this.reportService.exportToExcel(reportData);
    } catch (error: any) {
      console.error('Error exportando Excel:', error);
      alert('Error al exportar reporte');
    }
  }

  async exportReportPDF() {
    if (!this.isAdmin) return;

    try {
      const filter: any = {};
      
      if (this.reportFilter.tipo === 'empresa' && this.reportFilter.empresa) {
        filter.empresa = this.reportFilter.empresa;
      } else if (this.reportFilter.tipo === 'lugar' && this.reportFilter.lugar) {
        filter.lugar = this.reportFilter.lugar;
      }

      const reportData = this.reportService.generateReportData(this.personas, filter);
      await this.reportService.exportToPDF(reportData);
    } catch (error: any) {
      console.error('Error exportando PDF:', error);
      alert('Error al exportar reporte');
    }
  }

  get filteredPersonas(): Persona[] {
    const term = this.normalizeSearch(this.searchTerm);
    if (!term) return this.personas;

    return this.personas.filter((persona) => {
      const target = this.normalizeText([
        persona.nombre,
        persona.email,
        persona.telefono || '',
        persona.empresa || '',
        persona.lugar || '',
        persona.curp || '',
        this.getResultadoTexto(persona)
      ]
        .join(' '));

      return target.includes(term);
    });
  }

  private normalizeSearch(value?: string): string {
    return this.normalizeText(value || '').trim();
  }

  private getVisibleIds(): string[] {
    return this.filteredPersonas
      .map(persona => persona.id)
      .filter((id): id is string => !!id);
  }

  private syncSelectionWithCurrentData(): void {
    const validIds = new Set(
      this.personas
        .map(persona => persona.id)
        .filter((id): id is string => !!id)
    );

    this.selectedPersonaIds = new Set(
      [...this.selectedPersonaIds].filter(id => validIds.has(id))
    );
  }

  private normalizeText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  normalizeCurp(value?: string): string {
    return (value || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .trim();
  }

  private isValidCurp(value?: string): boolean {
    return this.CURP_REGEX.test(this.normalizeCurp(value));
  }
}




