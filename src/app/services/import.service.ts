import { Injectable } from '@angular/core';
import { Persona } from '../models/persona.model';

@Injectable({
  providedIn: 'root'
})
export class ImportService {
  private xlsxLoader: Promise<any> | null = null;
  private readonly xlsxScriptId = 'xlsx-cdn-script';

  constructor() {}

  async parseExcelFile(file: File): Promise<Persona[]> {
    try {
      this.validateFile(file);

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
        const nombre = normalizedRow['nombre'] || '';
        const email = (normalizedRow['email'] || normalizedRow['correo'] || '').toLowerCase();
        const curp = this.normalizeCurp(normalizedRow['curp'] || '');

        if (!nombre || !curp || !this.isValidCurp(curp) || !email || !this.isValidEmail(email) || seenEmails.has(email)) {
          continue;
        }

        seenEmails.add(email);

        personas.push({
          nombre,
          curp,
          email,
          telefono: normalizedRow['telefono'] || normalizedRow['celular'] || '',
          empresa: normalizedRow['empresa'] || '',
          lugar: normalizedRow['lugar'] || normalizedRow['ubicacion'] || normalizedRow['ciudad'] || '',
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
      .replace(/\s+/g, '');
  }

  private normalizeValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
