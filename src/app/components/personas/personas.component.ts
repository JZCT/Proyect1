import { Component, OnDestroy, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PersonaService } from '../../services/persona.service';
import { AuthService } from '../../services/auth.service';
import { ImportService } from '../../services/import.service';
import { ReportService } from '../../services/report.service';
import { NotificationService } from '../../services/notification.service';
import { Persona } from '../../models/persona.model';
import { User } from '../../models/user.model';
import { resolveAppAssetUrl } from '../../utils/asset-url.util';
import { sanitizePhoneInput, sanitizeScoreInput } from '../../utils/input-sanitizers.util';

type PersonaArchivo = NonNullable<Persona['archivos']>[number];
type FilePreviewType = 'image' | 'pdf' | 'text' | 'unsupported';

@Component({
  selector: 'app-personas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './personas.component.html',
  styleUrl: './personas.component.scss'
})
export class PersonasComponent implements OnInit, OnDestroy {
  @ViewChild('photoInput') photoInput!: ElementRef<HTMLInputElement>;
  @ViewChild('excelInput') excelInput!: ElementRef<HTMLInputElement>;
  @ViewChild('cameraVideo') cameraVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('cameraCanvas') cameraCanvas?: ElementRef<HTMLCanvasElement>;
  private readonly MIN_CALIFICACION_APTO = 80;
  private readonly CURP_REGEX = /^[A-Z0-9]{18}$/;
  private cameraStream: MediaStream | null = null;
  
  personas: Persona[] = [];
  allPersonas: Persona[] = [];
  showForm = false;
  editingId: string | null = null;
  loadingFile = false;
  cameraActive = false;
  showPhotoOptions = false;
  isAdmin = false;
  canGenerateReports = false;
  currentUser: User | null = null;
  searchTerm: string = '';
  sortBy: 'nombre' | 'empresa' | 'final' = 'nombre';
  sortDirection: 'asc' | 'desc' = 'asc';
  selectedPersonaIds = new Set<string>();
  deletingSelected = false;
  showFilePreview = false;
  previewFile: PersonaArchivo | null = null;
  previewType: FilePreviewType = 'unsupported';
  previewText = '';
  previewResourceUrl: SafeResourceUrl | null = null;

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
    private reportService: ReportService,
    private notificationService: NotificationService,
    private sanitizer: DomSanitizer
  ) {}

  get canEditPersonas(): boolean {
    return this.isAdmin || this.currentUser?.role === 'instructor';
  }

  updateCurrentTelefono(value: unknown): void {
    const telefono = sanitizePhoneInput(value);

    if (this.editingId) {
      this.editingPersona.telefono = telefono;
      return;
    }

    this.newPersona.telefono = telefono;
  }

  updateCurrentScore(field: 'clfPractica' | 'clfTeorica', value: unknown): void {
    const score = this.normalizeScoreForStorage(value);

    if (this.editingId) {
      this.editingPersona[field] = score;
      return;
    }

    this.newPersona[field] = score;
  }

  ngOnInit(): void {
    this.checkAdminStatus();
    this.loadCurrentUser();
    this.loadPersonas();
  }

  ngOnDestroy(): void {
    this.detenerCamara();
    this.closeArchivoPreview();
  }

  private checkAdminStatus() {
    this.authService.isAdmin().subscribe(isAdmin => {
      this.isAdmin = isAdmin;
    });
  }

  private loadCurrentUser() {
    this.authService.currentUserData$.subscribe((userData) => {
      this.currentUser = userData;
      this.canGenerateReports = userData?.role === 'admin' || userData?.role === 'company';
      this.applyPersonaVisibility();
    });
  }

  loadPersonas() {
    this.personaService.getPersonas().subscribe({
      next: (personas) => {
        this.allPersonas = personas;
        this.applyPersonaVisibility();
        console.log('Personas cargadas:', personas);
      },
      error: (error) => {
        console.error('Error cargando personas:', error);
      }
    });
  }

  private applyPersonaVisibility() {
    if (this.currentUser?.role === 'company') {
      const companyTag = this.normalizeCompanyTag(this.currentUser.companyTag || '');
      this.personas = companyTag
        ? this.allPersonas.filter((persona) =>
          this.normalizeCompanyTag(persona.empresa || '') === companyTag
        )
        : [];

      this.reportFilter.tipo = 'empresa';
      this.reportFilter.empresa = this.getCompanyEmpresaName();
      this.reportFilter.lugar = '';
    } else {
      this.personas = [...this.allPersonas];
    }

    this.syncSelectionWithCurrentData();
    this.updateFilterOptions();
  }

  private getCompanyEmpresaName(): string {
    const withEmpresa = this.personas.find((persona) => (persona.empresa || '').trim());
    if (withEmpresa?.empresa) return withEmpresa.empresa.trim();
    return (this.currentUser?.companyTag || '').trim();
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
      this.showMessage('No tienes permisos para realizar esta acción');
      return;
    }
    this.showForm = !this.showForm;
    if (!this.showForm) {
      this.resetForm();
    }
  }

  triggerCamera() {
    if (!this.canEditPersonas) {
      this.showMessage('No tienes permisos para realizar esta acción');
      return;
    }
    this.showPhotoOptions = !this.showPhotoOptions;
  }

  seleccionarArchivoFoto() {
    if (!this.canEditPersonas) return;

    this.showPhotoOptions = false;
    this.detenerCamara();
    this.photoInput.nativeElement.click();
  }

  tomarFotoDesdeMenu() {
    if (!this.canEditPersonas) return;

    this.showPhotoOptions = false;
    this.iniciarCamara();
  }

  onPhotoSelected(event: Event) {
    if (!this.canEditPersonas) return;

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.loadingFile = true;
      
      // Convertir a base64 para almacenar (en producción usarías Firebase Storage)
      const reader = new FileReader();
      reader.onload = (loadEvent: ProgressEvent<FileReader>) => {
        const base64 = loadEvent.target?.result as string;
        
        if (this.editingId) {
          this.editingPersona.foto = base64;
        } else {
          this.newPersona.foto = base64;
        }

        this.showPhotoOptions = false;
        this.detenerCamara();
        this.loadingFile = false;
      };
      reader.readAsDataURL(file);
    }
  }

  isCameraSupported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  async iniciarCamara() {
    if (!this.canEditPersonas) return;

    if (!this.isCameraSupported()) {
      this.showMessage('Tu navegador no soporta la camara');
      return;
    }

    try {
      this.detenerCamara();
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false
      });

      this.cameraActive = true;
      requestAnimationFrame(() => this.attachCameraStream());
    } catch (error) {
      console.error('Error iniciando camara:', error);
      this.showMessage('No se pudo abrir la camara. Revisa permisos del navegador.');
    }
  }

  private attachCameraStream() {
    if (!this.cameraVideo || !this.cameraStream) return;

    const video = this.cameraVideo.nativeElement;
    video.srcObject = this.cameraStream;
    video.play().catch((error) => {
      console.error('Error reproduciendo camara:', error);
    });
  }

  capturarFoto() {
    if (!this.canEditPersonas) return;
    if (!this.cameraVideo || !this.cameraCanvas) return;

    const video = this.cameraVideo.nativeElement;
    const canvas = this.cameraCanvas.nativeElement;

    if (!video.videoWidth || !video.videoHeight) {
      this.showMessage('La camara aun no esta lista. Intenta de nuevo.');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      this.showMessage('No se pudo capturar la imagen');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/png');

    if (this.editingId) {
      this.editingPersona.foto = base64;
    } else {
      this.newPersona.foto = base64;
    }

    this.detenerCamara();
  }

  detenerCamara() {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop());
      this.cameraStream = null;
    }

    if (this.cameraVideo?.nativeElement) {
      this.cameraVideo.nativeElement.srcObject = null;
    }

    this.cameraActive = false;
  }

  onFilesSelected(event: Event) {
    if (!this.canEditPersonas) return;

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
    return foto || resolveAppAssetUrl('assets/default-avatar.png');
  }

  async addPersona() {
    if (!this.isAdmin) return;

    if (!this.newPersona.nombre || !this.newPersona.email) {
      this.showMessage('Nombre y email son requeridos');
      return;
    }

    const newCurp = this.normalizeCurp(this.newPersona.curp);
    if (!newCurp) {
      this.showMessage('CURP es requerida');
      return;
    }

    if (!this.isValidCurp(newCurp)) {
      this.showMessage('CURP no es valida. Debe tener 18 caracteres alfanumericos');
      return;
    }

    try {
      const personaToSave = this.preparePersonaForSave(this.newPersona);
      await this.personaService.addPersona(personaToSave as Persona);
      this.resetForm();
      this.showForm = false;
    } catch (error) {
      console.error('Error agregando persona:', error);
      this.showMessage('Error al agregar persona');
    }
  }

  startEdit(persona: Persona) {
    if (!this.canEditPersonas) return;

    this.editingId = persona.id || null;
    this.editingPersona = {
      ...persona,
      curp: this.normalizeCurp(persona.curp),
      telefono: sanitizePhoneInput(persona.telefono)
    };
    this.showForm = true;
  }

  async updatePersona() {
    if (!this.canEditPersonas || !this.editingId) return;

    const editCurp = this.normalizeCurp(this.editingPersona.curp);
    if (!editCurp) {
      this.showMessage('CURP es requerida');
      return;
    }

    if (!this.isValidCurp(editCurp)) {
      this.showMessage('CURP no es valida. Debe tener 18 caracteres alfanumericos');
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
      this.showMessage('Error al actualizar persona');
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
        this.showMessage('Error al eliminar persona');
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
      this.showMessage(`Se eliminaron ${idsToDelete.length} personas`);
    } catch (error) {
      console.error('Error eliminando personas seleccionadas:', error);
      this.showMessage('Error al eliminar personas seleccionadas');
    } finally {
      this.deletingSelected = false;
    }
  }

  resetForm() {
    this.showPhotoOptions = false;
    this.detenerCamara();
    this.closeArchivoPreview();
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

    this.previewFile = file;
    this.previewType = this.getPreviewType(file);
    this.previewText = '';
    this.previewResourceUrl = null;

    if (this.previewType === 'pdf') {
      this.previewResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(file.url);
    }

    if (this.previewType === 'text') {
      this.loadTextPreview(file);
    }

    this.showFilePreview = true;
  }

  closeArchivoPreview(): void {
    this.showFilePreview = false;
    this.previewFile = null;
    this.previewType = 'unsupported';
    this.previewText = '';
    this.previewResourceUrl = null;
  }

  private getPreviewType(file: PersonaArchivo): FilePreviewType {
    const tipo = (file.tipo || '').toLowerCase();
    const nombre = (file.nombre || '').toLowerCase();

    if (tipo.startsWith('image/')) return 'image';
    if (tipo.includes('pdf') || nombre.endsWith('.pdf')) return 'pdf';

    const isTextFile =
      tipo.startsWith('text/') ||
      tipo.includes('json') ||
      nombre.endsWith('.txt') ||
      nombre.endsWith('.csv') ||
      nombre.endsWith('.json') ||
      nombre.endsWith('.xml') ||
      nombre.endsWith('.md');

    return isTextFile ? 'text' : 'unsupported';
  }

  private async loadTextPreview(file: PersonaArchivo): Promise<void> {
    try {
      const response = await fetch(file.url);
      this.previewText = await response.text();
    } catch (error) {
      console.error('Error cargando vista previa de texto:', error);
      this.previewText = 'No se pudo mostrar la vista previa de este archivo.';
    }
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
      telefono: sanitizePhoneInput(persona.telefono),
      clfPractica: this.normalizeScoreForStorage(persona.clfPractica),
      clfTeorica: this.normalizeScoreForStorage(persona.clfTeorica)
    };
  }

  private normalizeScoreForStorage(value: unknown): number | undefined {
    const score = this.getValidScore(value);
    return score === null ? undefined : score;
  }

  private getValidScore(value: unknown): number | null {
    return sanitizeScoreInput(value);
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
      this.showMessage('No tienes permisos para realizar esta accion');
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
      this.showMessage(`✅ Se importaron exitosamente ${this.bulkImportProgress === 100 ? 'todas' : 'la mayoría de'} las personas`);
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
      this.showMessage('Error al generar plantilla');
    } finally {
      this.bulkImportLoading = false;
    }
  }

  // ==================== REPORTES ====================

  toggleReports() {
    if (!this.canGenerateReports) {
      this.showMessage('No tienes permisos para generar reportes');
      return;
    }
    this.showReports = !this.showReports;
  }

  private buildReportFilter(): { empresa?: string; lugar?: string } {
    if (this.currentUser?.role === 'company') {
      const empresa = this.getCompanyEmpresaName();
      return empresa ? { empresa } : {};
    }

    const filter: { empresa?: string; lugar?: string } = {};

    if (this.reportFilter.tipo === 'empresa' && this.reportFilter.empresa) {
      filter.empresa = this.reportFilter.empresa;
    } else if (this.reportFilter.tipo === 'lugar' && this.reportFilter.lugar) {
      filter.lugar = this.reportFilter.lugar;
    }

    return filter;
  }

  async generateReport() {
    if (!this.canGenerateReports) return;

    try {
      const filter = this.buildReportFilter();
      const reportData = this.reportService.generateReportData(this.personas, filter);
      
      this.showMessage(`📊 Reporte generado: ${reportData.totalPersonas} personas`);
    } catch (error: any) {
      console.error('Error generando reporte:', error);
      this.showMessage('Error al generar reporte');
    }
  }

  async exportReportCSV() {
    if (!this.canGenerateReports) return;

    try {
      const filter = this.buildReportFilter();
      const reportData = this.reportService.generateReportData(this.personas, filter);
      this.reportService.exportToCSV(reportData);
    } catch (error: any) {
      console.error('Error exportando CSV:', error);
      this.showMessage('Error al exportar reporte');
    }
  }

  async exportReportExcel() {
    if (!this.canGenerateReports) return;

    try {
      const filter = this.buildReportFilter();
      const reportData = this.reportService.generateReportData(this.personas, filter);
      await this.reportService.exportToExcel(reportData);
    } catch (error: any) {
      console.error('Error exportando Excel:', error);
      this.showMessage('Error al exportar reporte');
    }
  }

  async exportReportPDF() {
    if (!this.canGenerateReports) return;

    try {
      const filter = this.buildReportFilter();
      const reportData = this.reportService.generateReportData(this.personas, filter);
      await this.reportService.exportToPDF(reportData);
    } catch (error: any) {
      console.error('Error exportando PDF:', error);
      this.showMessage('Error al exportar reporte');
    }
  }

  get filteredPersonas(): Persona[] {
    const term = this.normalizeSearch(this.searchTerm);
    const filtered = this.personas.filter((persona) => {
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

    return filtered.sort((a, b) => this.comparePersonas(a, b));
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

  private comparePersonas(a: Persona, b: Persona): number {
    const direction = this.sortDirection === 'asc' ? 1 : -1;

    if (this.sortBy === 'final') {
      const finalA = this.getCalificacionFinal(a) ?? -1;
      const finalB = this.getCalificacionFinal(b) ?? -1;
      return (finalA - finalB) * direction;
    }

    if (this.sortBy === 'empresa') {
      const empresaA = this.normalizeText(a.empresa || '');
      const empresaB = this.normalizeText(b.empresa || '');
      const result = empresaA.localeCompare(empresaB);
      if (result !== 0) return result * direction;
    }

    const nombreA = this.normalizeText(a.nombre || '');
    const nombreB = this.normalizeText(b.nombre || '');
    return nombreA.localeCompare(nombreB) * direction;
  }

  private showMessage(message: unknown): void {
    this.notificationService.notifyFromAlert(message);
  }

  normalizeCurp(value?: string): string {
    return (value || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .trim();
  }

  private normalizeCompanyTag(value: string): string {
    return (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .trim();
  }

  private isValidCurp(value?: string): boolean {
    return this.CURP_REGEX.test(this.normalizeCurp(value));
  }
}





