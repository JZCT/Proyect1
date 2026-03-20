import { Injectable } from '@angular/core';
import { Persona } from '../models/persona.model';

export interface BulkImportOptions {
  defaultEmpresa?: string;
  defaultLugar?: string;
  defaultTelefono?: string;
  emailDomain?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ImportService {
  private xlsxLoader: Promise<any> | null = null;
  private readonly xlsxScriptId = 'xlsx-cdn-script';
  private readonly fallbackEmailDomain = 'import.cecapta.local';

  constructor() {}

  async parseExcelFile(file: File, options: BulkImportOptions = {}): Promise<Persona[]> {
    try {
      this.validateFile(file);
      const importOptions = this.normalizeImportOptions(options);

      const XLSX = await this.loadXLSX();
      const data = await this.fileToArrayBuffer(file);
      const workbook = XLSX.read(data, { type: 'array' });

      if (!workbook.SheetNames?.length) {
        return [];
      }

      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Array<Record<string, unknown>>;

      const seenEmails = new Set<string>();
      const personas: Persona[] = [];

      for (const row of jsonData) {
        const normalizedRow = this.normalizeRow(row);
        const rowIndex = personas.length + 1;
        const nombre = this.extractNombre(normalizedRow);
        const parsedEmail = (normalizedRow['email'] || normalizedRow['correo'] || '').toLowerCase();
        const normalizedEmail = this.isValidEmail(parsedEmail)
          ? parsedEmail
          : this.buildFallbackEmail(nombre, rowIndex, importOptions.emailDomain);
        const email = this.ensureUniqueEmail(normalizedEmail, seenEmails);

        const parsedCurp = this.normalizeCurp(normalizedRow['curp'] || '');
        const curp = this.isValidCurp(parsedCurp) ? parsedCurp : this.buildFallbackCurp(rowIndex);

        if (!nombre || !email || !this.isValidEmail(email)) {
          continue;
        }

        seenEmails.add(email);

        personas.push({
          nombre,
          curp,
          email,
          telefono: normalizedRow['telefono'] || normalizedRow['celular'] || importOptions.defaultTelefono || '',
          empresa: normalizedRow['empresa'] || importOptions.defaultEmpresa || '',
          companyTag: this.normalizeCompanyTag(normalizedRow['empresa'] || importOptions.defaultEmpresa || ''),
          lugar: normalizedRow['lugar'] || normalizedRow['ubicacion'] || normalizedRow['ciudad'] || importOptions.defaultLugar || '',
          archivos: [],
          cursoIds: []
        });
      }

      return personas;
    } catch (error) {
      console.error('Error al parsear archivo Excel:', error);
      throw new Error('Error al procesar el archivo. Verifica que sea un XLS valido.');
    }
  }

  async generateTemplate(): Promise<void> {
    try {
      const XLSX = await this.loadXLSX();

      const templateData = [
        {
          nombre: 'Juan Perez Garcia',
          curp: 'PEGJ900101HDFRRN01',
          email: 'juan.perez@example.com',
          telefono: '+34 612 345 678',
          empresa: 'Tech Solutions',
          lugar: 'Madrid'
        },
        {
          nombre: 'Maria Lopez Martinez',
          curp: 'LOMM920202MDFPRR02',
          email: 'maria.lopez@example.com',
          telefono: '+34 678 901 234',
          empresa: 'Digital Services',
          lugar: 'Barcelona'
        }
      ];

      const worksheet = XLSX.utils.json_to_sheet(templateData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Personas');

      worksheet['!cols'] = [
        { wch: 25 },
        { wch: 22 },
        { wch: 30 },
        { wch: 20 },
        { wch: 25 },
        { wch: 20 }
      ];

      XLSX.writeFile(workbook, 'plantilla_personas.xlsx');
    } catch (error) {
      console.error('Error generando plantilla:', error);
      throw error;
    }
  }

  private validateFile(file: File): void {
    const allowedExtensions = ['.xls', '.xlsx'];
    const lowerName = file.name.toLowerCase();
    const isValid = allowedExtensions.some(ext => lowerName.endsWith(ext));

    if (!isValid) {
      throw new Error('Formato de archivo no soportado');
    }
  }

  private normalizeRow(row: Record<string, unknown>): Record<string, string> {
    return Object.entries(row).reduce<Record<string, string>>((acc, [key, value]) => {
      const normalizedKey = this.normalizeKey(key);
      const normalizedValue = this.normalizeValue(value);
      acc[normalizedKey] = normalizedValue;
      return acc;
    }, {});
  }

  private normalizeKey(key: string): string {
    return key
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  private normalizeValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private extractNombre(row: Record<string, string>): string {
    const fullName =
      row['nombre'] ||
      row['nombrecompleto'] ||
      row['persona'] ||
      row['empleado'];

    if (fullName) return this.normalizeValue(fullName);

    const nombres = row['nombres'] || row['name'];
    const apellidos = row['apellidos'] || row['apellido'] || row['lastname'];
    const combined = [nombres, apellidos].filter(Boolean).join(' ').trim();
    if (combined) return this.normalizeValue(combined);

    // Fallback: tomar la primera celda con texto util.
    const firstText = Object.values(row).find((value) => this.normalizeValue(value).length > 0);
    return firstText ? this.normalizeValue(firstText) : '';
  }

  private buildFallbackEmail(nombre: string, index: number, emailDomain: string): string {
    const safeDomain = this.normalizeEmailDomain(emailDomain) || this.fallbackEmailDomain;
    const local = this.slugify(nombre) || `persona${index}`;
    return `${local}.${index}@${safeDomain}`;
  }

  private ensureUniqueEmail(email: string, seenEmails: Set<string>): string {
    if (!seenEmails.has(email)) return email;

    const [localPartRaw, domainPartRaw] = email.split('@');
    const localPart = localPartRaw || 'persona';
    const domainPart = domainPartRaw || this.fallbackEmailDomain;

    let suffix = 2;
    let candidate = `${localPart}+${suffix}@${domainPart}`;
    while (seenEmails.has(candidate)) {
      suffix++;
      candidate = `${localPart}+${suffix}@${domainPart}`;
    }

    return candidate;
  }

  private buildFallbackCurp(index: number): string {
    return `TMP${String(index).padStart(15, '0')}`;
  }

  private slugify(value: string): string {
    return (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.|\.$/g, '')
      .replace(/\.{2,}/g, '.');
  }

  private normalizeEmailDomain(value: string): string {
    return (value || '')
      .toLowerCase()
      .trim()
      .replace(/^@+/, '')
      .replace(/[^a-z0-9.-]/g, '');
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

  private normalizeImportOptions(options: BulkImportOptions): Required<BulkImportOptions> {
    return {
      defaultEmpresa: this.normalizeValue(options.defaultEmpresa || ''),
      defaultLugar: this.normalizeValue(options.defaultLugar || ''),
      defaultTelefono: this.normalizeValue(options.defaultTelefono || ''),
      emailDomain: this.normalizeEmailDomain(options.emailDomain || this.fallbackEmailDomain)
    };
  }

  private normalizeCurp(curp: string): string {
    return (curp || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .trim();
  }

  private isValidCurp(curp: string): boolean {
    return /^[A-Z0-9]{18}$/.test(curp);
  }

  private loadXLSX(): Promise<any> {
    const globalXLSX = (window as any).XLSX;
    if (globalXLSX) {
      return Promise.resolve(globalXLSX);
    }

    if (this.xlsxLoader) {
      return this.xlsxLoader;
    }

    this.xlsxLoader = new Promise((resolve, reject) => {
      const existingScript = document.getElementById(this.xlsxScriptId) as HTMLScriptElement | null;

      const onReady = () => {
        const loadedXLSX = (window as any).XLSX;
        if (loadedXLSX) {
          resolve(loadedXLSX);
        } else {
          reject(new Error('No se pudo inicializar la libreria XLSX'));
        }
      };

      const onError = () => reject(new Error('No se pudo cargar la libreria XLSX'));

      if (existingScript) {
        existingScript.addEventListener('load', onReady, { once: true });
        existingScript.addEventListener('error', onError, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.id = this.xlsxScriptId;
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      script.async = true;
      script.onload = onReady;
      script.onerror = onError;
      document.head.appendChild(script);
    }).finally(() => {
      if (!(window as any).XLSX) {
        this.xlsxLoader = null;
      }
    });

    return this.xlsxLoader;
  }

  private fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        const result = event.target?.result;
        if (result instanceof ArrayBuffer) {
          resolve(result);
        } else {
          reject(new Error('Error al leer el archivo'));
        }
      };

      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.readAsArrayBuffer(file);
    });
  }
}
