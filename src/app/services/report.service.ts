import { Injectable } from '@angular/core';
import { Persona } from '../models/persona.model';
import { Curso } from '../models/curso.model';

export interface ReportFilter {
  empresa?: string;
  lugar?: string;
  instructorId?: string;
}

export interface ReportData {
  title: string;
  generatedAt: Date;
  totalPersonas: number;
  personas: Persona[];
  empresa?: string;
  lugar?: string;
  instructorName?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReportService {
  private xlsxLoader: Promise<any> | null = null;
  private readonly xlsxScriptId = 'xlsx-cdn-script';

  constructor() {}

  filterPersonas(personas: Persona[], filter: ReportFilter): Persona[] {
    if (!filter.empresa && !filter.lugar) {
      return personas;
    }

    const empresa = filter.empresa?.trim().toLowerCase();
    const lugar = filter.lugar?.trim().toLowerCase();

    return personas.filter((persona) => {
      if (empresa && (persona.empresa || '').trim().toLowerCase() !== empresa) return false;
      if (lugar && (persona.lugar || '').trim().toLowerCase() !== lugar) return false;
      return true;
    });
  }

  generateReportData(personas: Persona[], filter: ReportFilter, instructorName?: string): ReportData {
    const generatedAt = new Date();
    const filtered = this.filterPersonas(personas, filter);

    return {
      title: this.getReportTitle(filter),
      generatedAt,
      totalPersonas: filtered.length,
      personas: filtered,
      empresa: filter.empresa,
      lugar: filter.lugar,
      instructorName
    };
  }

  exportToCSV(reportData: ReportData): void {
    const resumen = this.getResumenResultados(reportData.personas);
    const headers = [
      'Nombre',
      'CURP',
      'Email',
      'Telefono',
      'Empresa',
      'Ubicacion',
      'Calif Practica',
      'Calif Teorica',
      'Calif Final',
      'Resultado',
      'Cursos'
    ];

    const rows = reportData.personas.map((persona) => [
      persona.nombre || '',
      persona.curp || '',
      persona.email || '',
      persona.telefono || '',
      persona.empresa || '',
      persona.lugar || 'N/A',
      this.formatCalificacion(persona.clfPractica),
      this.formatCalificacion(persona.clfTeorica),
      this.formatCalificacion(this.getCalificacionFinal(persona)),
      this.getResultadoTexto(persona),
      persona.cursoIds?.length || 0
    ]);

    const csvLines = [
      this.toCsvLine([reportData.title]),
      this.toCsvLine([`Generado: ${reportData.generatedAt.toLocaleString()}`]),
      this.toCsvLine([`Total personas: ${reportData.totalPersonas}`]),
      this.toCsvLine([`Aptos: ${resumen.aptos}`]),
      this.toCsvLine([`No aptos: ${resumen.noAptos}`]),
      this.toCsvLine([`Sin evaluar: ${resumen.sinEvaluar}`]),
      '',
      this.toCsvLine(headers),
      ...rows.map((row) => this.toCsvLine(row))
    ];

    const csvContent = csvLines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const timestamp = reportData.generatedAt.getTime();
    this.downloadFile(blob, `reporte_${this.sanitizeFilename(reportData.title)}_${timestamp}.csv`);
  }

  async exportToExcel(reportData: ReportData): Promise<void> {
    try {
      const XLSX = await this.loadXLSX();
      const resumen = this.getResumenResultados(reportData.personas);

      const data = reportData.personas.map((persona) => ({
        Nombre: persona.nombre,
        CURP: persona.curp || '',
        Email: persona.email,
        Telefono: persona.telefono,
        Empresa: persona.empresa,
        Ubicacion: persona.lugar || '-',
        'Calif Practica': this.formatCalificacion(persona.clfPractica),
        'Calif Teorica': this.formatCalificacion(persona.clfTeorica),
        'Calif Final': this.formatCalificacion(this.getCalificacionFinal(persona)),
        Resultado: this.getResultadoTexto(persona),
        'Cursos Asignados': persona.cursoIds?.length || 0,
        'Fecha Creacion': persona.createdAt ? new Date(persona.createdAt).toLocaleDateString() : '-'
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);
      const summarySheet = XLSX.utils.json_to_sheet([
        { Metrica: 'Titulo', Valor: reportData.title },
        { Metrica: 'Generado', Valor: reportData.generatedAt.toLocaleString() },
        { Metrica: 'Total personas', Valor: reportData.totalPersonas },
        { Metrica: 'Aptos', Valor: resumen.aptos },
        { Metrica: 'No aptos', Valor: resumen.noAptos },
        { Metrica: 'Sin evaluar', Valor: resumen.sinEvaluar }
      ]);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Personas');
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');

      worksheet['!cols'] = [
        { wch: 25 },
        { wch: 22 },
        { wch: 30 },
        { wch: 20 },
        { wch: 25 },
        { wch: 20 },
        { wch: 14 },
        { wch: 14 },
        { wch: 12 },
        { wch: 12 },
        { wch: 15 },
        { wch: 18 }
      ];
      summarySheet['!cols'] = [{ wch: 24 }, { wch: 38 }];

      const filename = `reporte_${this.sanitizeFilename(reportData.title)}_${reportData.generatedAt.getTime()}.xlsx`;
      XLSX.writeFile(workbook, filename);
    } catch (error) {
      console.error('Error exportando a Excel:', error);
      throw new Error('Error al exportar reporte');
    }
  }

  async exportToPDF(reportData: ReportData): Promise<void> {
    try {
      const html = this.generateHTMLReport(reportData);
      const blob = new Blob([html], { type: 'text/html' });
      const url = window.URL.createObjectURL(blob);

      const reportWindow = window.open(url, '_blank');
      if (!reportWindow) {
        window.URL.revokeObjectURL(url);
        throw new Error('No se pudo abrir la ventana del reporte');
      }

      reportWindow.onload = () => {
        reportWindow.print();
        window.URL.revokeObjectURL(url);
      };
    } catch (error) {
      console.error('Error exportando a PDF:', error);
      throw new Error('Error al exportar reporte');
    }
  }

  async exportCursosToExcel(
    cursos: Curso[],
    options?: { title?: string; companyTag?: string }
  ): Promise<void> {
    try {
      const XLSX = await this.loadXLSX();
      const generatedAt = new Date();
      const title = options?.title || 'Reporte de Cursos';

      const data = cursos.map((curso) => ({
        Nombre: curso.nombre || '',
        Descripcion: curso.descripcion || '',
        'Etiqueta Empresa': curso.companyTag || '',
        Inicio: curso.Fecha_inicio ? new Date(curso.Fecha_inicio).toLocaleDateString() : '-',
        Fin: curso.Fecha_fin ? new Date(curso.Fecha_fin).toLocaleDateString() : '-',
        Representante: curso.nom_representante || '',
        'Telefono Representante': curso.num_represnetantes || '',
        Instructores: curso.instructorIds?.length || 0
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);
      worksheet['!cols'] = [
        { wch: 28 },
        { wch: 45 },
        { wch: 22 },
        { wch: 14 },
        { wch: 14 },
        { wch: 24 },
        { wch: 22 },
        { wch: 12 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Cursos');

      const filename = `reporte_${this.sanitizeFilename(title)}_${generatedAt.getTime()}.xlsx`;
      XLSX.writeFile(workbook, filename);
    } catch (error) {
      console.error('Error exportando cursos a Excel:', error);
      throw new Error('Error al exportar reporte de cursos');
    }
  }

  async exportCursosToPDF(
    cursos: Curso[],
    options?: { title?: string; companyTag?: string }
  ): Promise<void> {
    try {
      const generatedAt = new Date();
      const title = options?.title || 'Reporte de Cursos';

      const cursosTable = cursos
        .map(
          (curso) => `
        <tr>
          <td>${this.escapeHtml(curso.nombre || '')}</td>
          <td>${this.escapeHtml(curso.descripcion || '')}</td>
          <td>${this.escapeHtml(curso.companyTag || '-')}</td>
          <td>${curso.Fecha_inicio ? this.escapeHtml(new Date(curso.Fecha_inicio).toLocaleDateString()) : '-'}</td>
          <td>${curso.Fecha_fin ? this.escapeHtml(new Date(curso.Fecha_fin).toLocaleDateString()) : '-'}</td>
          <td>${this.escapeHtml(curso.nom_representante || '-')}</td>
          <td>${this.escapeHtml(curso.num_represnetantes || '-')}</td>
        </tr>
      `
        )
        .join('');

      const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${this.escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
          .header-info { margin-bottom: 20px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background-color: #007bff; color: white; padding: 10px; text-align: left; font-size: 12px; }
          td { border-bottom: 1px solid #ddd; padding: 8px; font-size: 12px; }
          tr:nth-child(even) { background-color: #f7f9fc; }
          .summary { margin-top: 20px; padding: 10px; background-color: #f0f0f0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <h1>${this.escapeHtml(title)}</h1>
        <div class="header-info">
          <p><strong>Generado:</strong> ${generatedAt.toLocaleString()}</p>
          ${options?.companyTag ? `<p><strong>Empresa:</strong> ${this.escapeHtml(options.companyTag)}</p>` : ''}
        </div>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Descripcion</th>
              <th>Etiqueta Empresa</th>
              <th>Inicio</th>
              <th>Fin</th>
              <th>Representante</th>
              <th>Telefono</th>
            </tr>
          </thead>
          <tbody>
            ${cursosTable}
          </tbody>
        </table>
        <div class="summary">
          <strong>Total de cursos:</strong> ${cursos.length}
        </div>
      </body>
      </html>
      `;

      const blob = new Blob([html], { type: 'text/html' });
      const url = window.URL.createObjectURL(blob);

      const reportWindow = window.open(url, '_blank');
      if (!reportWindow) {
        window.URL.revokeObjectURL(url);
        throw new Error('No se pudo abrir la ventana del reporte');
      }

      reportWindow.onload = () => {
        reportWindow.print();
        window.URL.revokeObjectURL(url);
      };
    } catch (error) {
      console.error('Error exportando cursos a PDF:', error);
      throw new Error('Error al exportar reporte de cursos');
    }
  }

  private getReportTitle(filter: ReportFilter): string {
    if (filter.empresa) return `Reporte de Personas - Empresa: ${filter.empresa}`;
    if (filter.lugar) return `Reporte de Personas - Ubicacion: ${filter.lugar}`;
    if (filter.instructorId) return 'Reporte de Personas por Instructor';
    return 'Reporte General de Personas';
  }

  private generateHTMLReport(reportData: ReportData): string {
    const resumen = this.getResumenResultados(reportData.personas);
    const personasTable = reportData.personas
      .map((persona) => `
        <tr>
          <td>${this.escapeHtml(persona.nombre)}</td>
          <td>${this.escapeHtml(persona.curp || '')}</td>
          <td>${this.escapeHtml(persona.email)}</td>
          <td>${this.escapeHtml(persona.telefono || '')}</td>
          <td>${this.escapeHtml(persona.empresa || '')}</td>
          <td>${this.escapeHtml(persona.lugar || '-')}</td>
          <td>${this.formatCalificacion(persona.clfPractica)}</td>
          <td>${this.formatCalificacion(persona.clfTeorica)}</td>
          <td>${this.formatCalificacion(this.getCalificacionFinal(persona))}</td>
          <td>${this.getResultadoTexto(persona)}</td>
          <td>${persona.cursoIds?.length || 0}</td>
        </tr>
      `)
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${this.escapeHtml(reportData.title)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
          .header-info { margin-bottom: 20px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background-color: #007bff; color: white; padding: 12px; text-align: left; }
          td { border-bottom: 1px solid #ddd; padding: 10px; }
          tr:hover { background-color: #f5f5f5; }
          .summary { margin-top: 20px; padding: 10px; background-color: #f0f0f0; border-radius: 5px; }
          .footer { margin-top: 30px; text-align: right; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>${this.escapeHtml(reportData.title)}</h1>
        <div class="header-info">
          <p><strong>Generado:</strong> ${reportData.generatedAt.toLocaleString()}</p>
          ${reportData.empresa ? `<p><strong>Empresa:</strong> ${this.escapeHtml(reportData.empresa)}</p>` : ''}
          ${reportData.lugar ? `<p><strong>Ubicacion:</strong> ${this.escapeHtml(reportData.lugar)}</p>` : ''}
          ${reportData.instructorName ? `<p><strong>Instructor:</strong> ${this.escapeHtml(reportData.instructorName)}</p>` : ''}
        </div>

        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>CURP</th>
              <th>Email</th>
              <th>Telefono</th>
              <th>Empresa</th>
              <th>Ubicacion</th>
              <th>Practica</th>
              <th>Teorica</th>
              <th>Final</th>
              <th>Resultado</th>
              <th>Cursos</th>
            </tr>
          </thead>
          <tbody>
            ${personasTable}
          </tbody>
        </table>

        <div class="summary">
          <strong>Total de personas:</strong> ${reportData.totalPersonas}
          <br />
          <strong>Aptos:</strong> ${resumen.aptos}
          <br />
          <strong>No aptos:</strong> ${resumen.noAptos}
          <br />
          <strong>Sin evaluar:</strong> ${resumen.sinEvaluar}
        </div>

        <div class="footer">
          <p>Reporte generado automaticamente - ${new Date().toLocaleString()}</p>
        </div>
      </body>
      </html>
    `;
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

  private toCsvLine(values: Array<string | number>): string {
    return values.map((value) => this.escapeCsvValue(value)).join(',');
  }

  private escapeCsvValue(value: string | number): string {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private downloadFile(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  private sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  }

  private getCalificacionFinal(persona: Partial<Persona>): number | null {
    const practica = this.getValidScore(persona.clfPractica);
    const teorica = this.getValidScore(persona.clfTeorica);
    if (practica === null || teorica === null) return null;
    return Math.round(((practica + teorica) / 2) * 10) / 10;
  }

  private getResultadoTexto(persona: Partial<Persona>): string {
    const final = this.getCalificacionFinal(persona);
    if (final === null) return 'Sin evaluar';
    return final >= 80 ? 'Apto' : 'No apto';
  }

  private getResumenResultados(personas: Persona[]): { aptos: number; noAptos: number; sinEvaluar: number } {
    let aptos = 0;
    let noAptos = 0;
    let sinEvaluar = 0;

    for (const persona of personas) {
      const resultado = this.getResultadoTexto(persona);
      if (resultado === 'Apto') {
        aptos++;
      } else if (resultado === 'No apto') {
        noAptos++;
      } else {
        sinEvaluar++;
      }
    }

    return { aptos, noAptos, sinEvaluar };
  }

  private getValidScore(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return null;
    return Math.max(0, Math.min(100, numeric));
  }

  private formatCalificacion(value: unknown): string {
    const score = this.getValidScore(value);
    return score === null ? '-' : score.toFixed(1);
  }
}
