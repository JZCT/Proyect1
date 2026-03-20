import { Injectable } from '@angular/core';
import { Persona } from '../models/persona.model';
import { Curso } from '../models/curso.model';
import { APP_LOGO_URL } from '../utils/branding.util';

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

interface ReportMetadataItem {
  label: string;
  value: string;
}

interface ReportSummaryItem {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'success' | 'danger' | 'muted';
}

interface PdfDocumentOptions {
  title: string;
  subtitle: string;
  documentCode: string;
  generatedAt: Date;
  metadata: ReportMetadataItem[];
  summary: ReportSummaryItem[];
  tableHeaders: string[];
  tableRowsHtml: string;
  emptyMessage: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReportService {
  private xlsxLoader: Promise<any> | null = null;
  private readonly xlsxScriptId = 'xlsx-cdn-script';
  private readonly reportBrand = 'Sistema de Capacitacion';
  private readonly reportArea = 'Control documental y seguimiento';
  private readonly reportLogoUrl = APP_LOGO_URL;

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

      const html = this.buildPdfDocument({
        title,
        subtitle: 'Relacion oficial de cursos registrados en el sistema para consulta y control interno.',
        documentCode: 'RPT-CUR',
        generatedAt,
        metadata: [
          { label: 'Fecha de emision', value: generatedAt.toLocaleString() },
          { label: 'Empresa', value: options?.companyTag || 'Todas las empresas' },
          { label: 'Total de registros', value: String(cursos.length) }
        ],
        summary: [
          { label: 'Total de cursos', value: cursos.length, tone: 'neutral' }
        ],
        tableHeaders: [
          'Nombre',
          'Descripcion',
          'Etiqueta Empresa',
          'Inicio',
          'Fin',
          'Representante',
          'Telefono'
        ],
        tableRowsHtml: cursosTable,
        emptyMessage: 'No hay cursos para mostrar en este reporte.'
      });

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
          <td>${this.escapeHtml(persona.nombre || '')}</td>
          <td>${this.escapeHtml(persona.curp || '')}</td>
          <td>${this.escapeHtml(persona.email || '')}</td>
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

    return this.buildPdfDocument({
      title: reportData.title,
      subtitle: 'Resumen consolidado de participantes, evaluaciones y asignaciones registradas en la plataforma.',
      documentCode: 'RPT-PER',
      generatedAt: reportData.generatedAt,
      metadata: [
        { label: 'Fecha de emision', value: reportData.generatedAt.toLocaleString() },
        { label: 'Empresa', value: reportData.empresa || 'Todas las empresas' },
        { label: 'Ubicacion', value: reportData.lugar || 'Todas las ubicaciones' },
        { label: 'Instructor', value: reportData.instructorName || 'No especificado' }
      ],
      summary: [
        { label: 'Total de personas', value: reportData.totalPersonas, tone: 'neutral' },
        { label: 'Aptos', value: resumen.aptos, tone: 'success' },
        { label: 'No aptos', value: resumen.noAptos, tone: 'danger' },
        { label: 'Sin evaluar', value: resumen.sinEvaluar, tone: 'muted' }
      ],
      tableHeaders: [
        'Nombre',
        'CURP',
        'Email',
        'Telefono',
        'Empresa',
        'Ubicacion',
        'Practica',
        'Teorica',
        'Final',
        'Resultado',
        'Cursos'
      ],
      tableRowsHtml: personasTable,
      emptyMessage: 'No hay personas para mostrar con los filtros seleccionados.'
    });
  }

  private buildPdfDocument(options: PdfDocumentOptions): string {
    const metadata = options.metadata
      .filter((item) => item.value && item.value.trim())
      .map(
        (item) => `
          <div class="meta-card">
            <span class="meta-card__label">${this.escapeHtml(item.label)}</span>
            <span class="meta-card__value">${this.escapeHtml(item.value)}</span>
          </div>
        `
      )
      .join('');

    const summary = options.summary
      .map(
        (item) => `
          <div class="summary-card summary-card--${item.tone || 'neutral'}">
            <span class="summary-card__label">${this.escapeHtml(item.label)}</span>
            <strong class="summary-card__value">${this.escapeHtml(String(item.value))}</strong>
          </div>
        `
      )
      .join('');

    const headers = options.tableHeaders
      .map((header) => `<th>${this.escapeHtml(header)}</th>`)
      .join('');

    const rows = options.tableRowsHtml.trim()
      ? options.tableRowsHtml
      : `
        <tr class="empty-row">
          <td colspan="${options.tableHeaders.length}">${this.escapeHtml(options.emptyMessage)}</td>
        </tr>
      `;

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${this.escapeHtml(options.title)}</title>
        <style>${this.getPdfStyles()}</style>
      </head>
      <body>
        <main class="sheet">
          <header class="letterhead">
            <div class="letterhead__topline">
              <div class="letterhead__identity">
                <div class="logo-slot">
                  ${
                    this.reportLogoUrl
                      ? `<img src="${this.escapeHtml(this.reportLogoUrl)}" alt="Logo de la empresa" class="logo-slot__image" />`
                      : `<div class="logo-slot__placeholder">Espacio para logo de la empresa</div>`
                  }
                </div>
                <div>
                <p class="brand-kicker">${this.escapeHtml(this.reportArea)}</p>
                <div class="brand-name">${this.escapeHtml(this.reportBrand)}</div>
                </div>
              </div>
              <div class="doc-pill">
                <span>Documento</span>
                <strong>${this.escapeHtml(options.documentCode)}</strong>
              </div>
            </div>

            <div class="letterhead__body">
              <div class="title-block">
                <p class="section-tag">Reporte institucional</p>
                <h1>${this.escapeHtml(options.title)}</h1>
                <p class="subtitle">${this.escapeHtml(options.subtitle)}</p>
              </div>
              <div class="meta-grid">
                ${metadata}
              </div>
            </div>
          </header>

          <section class="content">
            <div class="summary-grid">
              ${summary}
            </div>

            <div class="table-wrap">
              <table>
                <thead>
                  <tr>${headers}</tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </div>

            <footer class="footer">
              <div class="footer__note">
                Documento emitido automaticamente para consulta y respaldo interno.
              </div>
              <div class="footer__date">
                ${this.escapeHtml(options.generatedAt.toLocaleString())}
              </div>
            </footer>
          </section>
        </main>
      </body>
      </html>
    `;
  }

  private getPdfStyles(): string {
    return `
      :root {
        --ink: #17324d;
        --muted: #607084;
        --paper: #ffffff;
        --canvas: #edf3f7;
        --line: #d8e1e8;
        --accent: #0f766e;
        --accent-deep: #0f172a;
        --accent-soft: #d7f3ee;
        --success: #dff7e8;
        --danger: #fde6e2;
        --neutral: #eef4f9;
      }

      * {
        box-sizing: border-box;
      }

      @page {
        margin: 14mm;
      }

      body {
        margin: 0;
        background: var(--canvas);
        color: var(--ink);
        font-family: "Segoe UI", Tahoma, sans-serif;
      }

      .sheet {
        max-width: 1180px;
        margin: 0 auto;
        background: var(--paper);
        border: 1px solid var(--line);
        box-shadow: 0 20px 45px rgba(15, 23, 42, 0.12);
      }

      .letterhead {
        position: relative;
        overflow: hidden;
        padding: 24px 28px 22px;
        color: #ffffff;
        background:
          radial-gradient(circle at top right, rgba(255, 255, 255, 0.14), transparent 34%),
          linear-gradient(135deg, #0f172a 0%, #164e63 42%, #0f766e 100%);
      }

      .letterhead::after {
        content: "";
        position: absolute;
        right: -48px;
        bottom: -72px;
        width: 220px;
        height: 220px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.08);
      }

      .letterhead__topline,
      .letterhead__body,
      .content,
      .summary-grid,
      .footer {
        position: relative;
        z-index: 1;
      }

      .letterhead__topline {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        align-items: flex-start;
      }

      .letterhead__identity {
        display: flex;
        gap: 20px;
        align-items: center;
      }

      .brand-kicker,
      .section-tag,
      .meta-card__label,
      .summary-card__label,
      .doc-pill span {
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 10px;
      }

      .brand-kicker {
        opacity: 0.76;
        margin-bottom: 6px;
      }

      .brand-name {
        font-size: 28px;
        font-weight: 700;
        letter-spacing: 0.03em;
      }

      .logo-slot {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 176px;
        min-width: 176px;
        height: 122px;
        padding: 12px;
        border-radius: 22px;
        border: 1px dashed rgba(255, 255, 255, 0.48);
        background: rgba(255, 255, 255, 0.1);
      }

      .logo-slot__image {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }

      .logo-slot__placeholder {
        text-align: center;
        font-size: 11px;
        line-height: 1.45;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: rgba(255, 255, 255, 0.88);
      }

      .doc-pill {
        min-width: 160px;
        padding: 10px 14px;
        text-align: right;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.12);
      }

      .doc-pill span {
        display: block;
        opacity: 0.75;
      }

      .doc-pill strong {
        display: block;
        margin-top: 4px;
        font-size: 18px;
        letter-spacing: 0.04em;
      }

      .letterhead__body {
        display: grid;
        grid-template-columns: minmax(0, 1.4fr) minmax(280px, 1fr);
        gap: 20px;
        margin-top: 18px;
      }

      .title-block h1 {
        margin: 8px 0 10px;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 31px;
        line-height: 1.08;
      }

      .section-tag {
        color: rgba(255, 255, 255, 0.76);
      }

      .subtitle {
        margin: 0;
        max-width: 760px;
        color: rgba(255, 255, 255, 0.86);
        font-size: 13px;
        line-height: 1.55;
      }

      .meta-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        align-content: end;
      }

      .meta-card {
        padding: 11px 12px;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.12);
      }

      .meta-card__label {
        display: block;
        margin-bottom: 5px;
        opacity: 0.74;
      }

      .meta-card__value {
        display: block;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.35;
        word-break: break-word;
      }

      .content {
        padding: 22px 28px 28px;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
        gap: 12px;
        margin-bottom: 18px;
      }

      .summary-card {
        padding: 14px 16px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: var(--neutral);
      }

      .summary-card--success {
        background: var(--success);
        border-color: #b9e8cb;
      }

      .summary-card--danger {
        background: var(--danger);
        border-color: #f5c3bc;
      }

      .summary-card--muted {
        background: #f3f4f6;
        border-color: #e5e7eb;
      }

      .summary-card__label {
        display: block;
        margin-bottom: 8px;
        color: var(--muted);
      }

      .summary-card__value {
        font-size: 25px;
        line-height: 1;
      }

      .table-wrap {
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 18px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      thead th {
        padding: 12px 10px;
        background: var(--accent);
        color: #ffffff;
        text-align: left;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      tbody td {
        padding: 10px;
        border-top: 1px solid #e7edf2;
        font-size: 12px;
        vertical-align: top;
      }

      tbody tr:nth-child(even) {
        background: #f8fafc;
      }

      .empty-row td {
        padding: 24px 16px;
        text-align: center;
        color: var(--muted);
        font-style: italic;
      }

      .footer {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-end;
        margin-top: 18px;
        padding-top: 14px;
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-size: 12px;
      }

      .footer__note {
        max-width: 70%;
      }

      .footer__date {
        white-space: nowrap;
        font-weight: 600;
      }

      @media print {
        body {
          background: #ffffff;
        }

        .sheet {
          border: none;
          box-shadow: none;
        }
      }

      @media (max-width: 920px) {
        .letterhead__body {
          grid-template-columns: 1fr;
        }

        .meta-grid {
          grid-template-columns: 1fr;
        }

        .doc-pill {
          text-align: left;
        }

        .letterhead__identity {
          align-items: flex-start;
          flex-direction: column;
        }

        .logo-slot {
          width: 152px;
          min-width: 152px;
          height: 108px;
        }

        .footer {
          flex-direction: column;
          align-items: flex-start;
        }

        .footer__note,
        .footer__date {
          max-width: none;
          white-space: normal;
        }
      }
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
