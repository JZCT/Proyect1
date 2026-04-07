import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  deleteDoc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  runTransaction
} from '@angular/fire/firestore';
import {
  Storage,
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes
} from '@angular/fire/storage';
import { Observable, combineLatest, map } from 'rxjs';
import { Curso, CursoArchivo } from '../models/curso.model';
import { Persona } from '../models/persona.model';
import { coerceDate, normalizeDateInput } from '../utils/date.util';

type CursoArchivoInput = NonNullable<Curso['archivos']>[number] & {
  file?: File;
};

type PeriodRange = {
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
  startKey: number;
  endKey: number;
  rangeStart: Date;
  rangeEnd: Date;
};

type RawCurso = Partial<Curso> & {
  idcurso?: string;
  fecha_inicio?: unknown;
  fecha_fin?: unknown;
  anioCurso?: unknown;
  anio_curso?: unknown;
  anio?: unknown;
  year?: unknown;
  mesCurso?: unknown;
  mes_curso?: unknown;
  mes?: unknown;
  month?: unknown;
  company_tag?: unknown;
  nomRepresentante?: unknown;
  representante?: unknown;
  num_representantes?: unknown;
  telefono_representante?: unknown;
  personas_ids?: unknown;
  instructor_ids?: unknown;
  archivos?: unknown;
  files?: unknown;
  documentos?: unknown;
};

@Injectable({
  providedIn: 'root'
})
export class CursoService {
  private readonly MIN_INSTRUCTORES = 1;
  private readonly MAX_INSTRUCTORES = 3;
  private readonly MAX_DOCUMENT_SIZE_BYTES = 900_000;
  private readonly STORAGE_ROOT = 'cursos';
  private readonly STORAGE_FILES_FOLDER = 'archivos';

  private cursosCollection;

  constructor(private firestore: Firestore, private storage: Storage) {
    this.cursosCollection = collection(this.firestore, 'cursos');
  }

  getCursos(): Observable<Curso[]> {
    return collectionData(this.cursosCollection, { idField: 'idcurso' }).pipe(
      map((rows) =>
        (rows as RawCurso[])
          .map((row) => this.normalizeCurso(row))
      )
    );
  }

  getCursosByPeriod(filters?: {
    year?: number | null;
    month?: number | null;
    startYear?: number | null;
    startMonth?: number | null;
    endYear?: number | null;
    endMonth?: number | null;
  }): Observable<Curso[]> {
    const normalizedYear = this.normalizeYearValue(filters?.year);
    const normalizedMonth = this.normalizeMonthValue(filters?.month);
    const explicitRange = this.resolvePeriodRange(
      filters?.startYear,
      filters?.startMonth,
      filters?.endYear,
      filters?.endMonth
    );

    if (!explicitRange && !normalizedYear) {
      return this.getCursos();
    }

    const effectiveRange = explicitRange || this.resolvePeriodRange(
      normalizedYear,
      normalizedMonth || 1,
      normalizedYear,
      normalizedMonth || 12
    );
    if (!effectiveRange) {
      return this.getCursos();
    }

    const cursosByNormalizedFields$ = collectionData(
      query(
        this.cursosCollection,
        where('anioCurso', '>=', effectiveRange.startYear),
        where('anioCurso', '<=', effectiveRange.endYear)
      ),
      { idField: 'idcurso' }
    ) as Observable<RawCurso[]>;

    const cursosByFechaInicio$ = collectionData(
      query(
        this.cursosCollection,
        where('Fecha_inicio', '>=', effectiveRange.rangeStart),
        where('Fecha_inicio', '<=', effectiveRange.rangeEnd)
      ),
      { idField: 'idcurso' }
    ) as Observable<RawCurso[]>;

    const cursosByFechaInicioLegacy$ = collectionData(
      query(
        this.cursosCollection,
        where('fecha_inicio', '>=', effectiveRange.rangeStart),
        where('fecha_inicio', '<=', effectiveRange.rangeEnd)
      ),
      { idField: 'idcurso' }
    ) as Observable<RawCurso[]>;

    const cursosByCreatedAt$ = collectionData(
      query(
        this.cursosCollection,
        where('createdAt', '>=', effectiveRange.rangeStart),
        where('createdAt', '<=', effectiveRange.rangeEnd)
      ),
      { idField: 'idcurso' }
    ) as Observable<RawCurso[]>;

    return combineLatest([
      cursosByNormalizedFields$,
      cursosByFechaInicio$,
      cursosByFechaInicioLegacy$,
      cursosByCreatedAt$
    ]).pipe(
      map(([rowsByFields, rowsByInicio, rowsByInicioLegacy, rowsByCreatedAt]) => {
        const deduped = new Map<string, Curso>();
        let fallbackIndex = 0;

        for (const row of [...rowsByFields, ...rowsByInicio, ...rowsByInicioLegacy, ...rowsByCreatedAt]) {
          const normalized = this.normalizeCurso(row);
          const resolvedYear = this.resolveCursoYear(
            normalized.anioCurso,
            normalized.Fecha_inicio,
            normalized.createdAt
          );
          const resolvedMonth = this.resolveCursoMonth(
            normalized.mesCurso,
            normalized.Fecha_inicio,
            normalized.createdAt
          );
          const periodKey = this.toPeriodKey(resolvedYear, resolvedMonth);

          if (periodKey === null || periodKey < effectiveRange.startKey || periodKey > effectiveRange.endKey) {
            continue;
          }

          const id = normalized.idcurso || `curso-sin-id-${fallbackIndex++}`;
          if (!deduped.has(id)) {
            deduped.set(id, normalized);
          }
        }

        return [...deduped.values()];
      })
    );
  }

  async addCurso(curso: Curso): Promise<void> {
    const instructorIds = this.normalizeInstructorIds(curso.instructorIds);
    this.ensureInstructorCountInRange(instructorIds);
    const personasIds = this.normalizeIdList(curso.personasIds);
    const cursoDoc = doc(this.cursosCollection);
    const uploadedStoragePaths: string[] = [];

    try {
      const preparedCurso = await this.prepareCursoForFirestore(
        {
          ...curso,
          instructorIds,
          personasIds,
          createdAt: new Date()
        },
        cursoDoc.id,
        uploadedStoragePaths
      );

      const payload = this.sanitizeForFirestore(preparedCurso) as Record<string, unknown>;
      this.ensureDocumentSize(payload, 'agregar');
      await setDoc(cursoDoc, payload as any);
    } catch (error) {
      await this.deleteStoragePaths(uploadedStoragePaths);
      console.error('Error agregando curso:', error);
      throw error;
    }
  }

  async updateCurso(id: string, curso: Partial<Curso>): Promise<void> {
    const cursoDoc = doc(this.firestore, `cursos/${id}`);
    const uploadedStoragePaths: string[] = [];

    try {
      const existingCurso = await this.getCursoById(id);
      const payload: Partial<Curso> = { ...curso };

      if (payload.instructorIds !== undefined) {
        const instructorIds = this.normalizeInstructorIds(payload.instructorIds);
        this.ensureInstructorCountInRange(instructorIds);
        payload.instructorIds = instructorIds;
      }

      if (payload.personasIds !== undefined) {
        payload.personasIds = this.normalizeIdList(payload.personasIds);
      }

      const preparedCurso = await this.prepareCursoForFirestore(
        {
          ...(existingCurso || {}),
          ...payload
        },
        id,
        uploadedStoragePaths
      );

      const serialized = this.sanitizeForFirestore(preparedCurso) as Record<string, unknown>;
      if (Object.keys(serialized).length === 0) return;

      this.ensureDocumentSize(serialized, 'actualizar');
      await setDoc(cursoDoc, serialized as any, { merge: true });

      const removedStoragePaths = this.getRemovedStoragePaths(existingCurso?.archivos, preparedCurso.archivos);
      await this.deleteStoragePaths(removedStoragePaths);
    } catch (error) {
      await this.deleteStoragePaths(uploadedStoragePaths);
      console.error('Error actualizando curso:', error);
      throw error;
    }
  }

  async deleteCurso(id: string): Promise<void> {
    try {
      const existingCurso = await this.getCursoById(id);
      const cursoDoc = doc(this.firestore, `cursos/${id}`);
      await deleteDoc(cursoDoc);
      await this.deleteStoragePaths(this.getStoragePathsFromArchivos(existingCurso?.archivos));
    } catch (error) {
      console.error('Error eliminando curso:', error);
      throw error;
    }
  }

  async getCursoById(id: string): Promise<Curso | null> {
    try {
      const cursoDoc = doc(this.firestore, `cursos/${id}`);
      const snapshot = await getDoc(cursoDoc);

      if (!snapshot.exists()) {
        return null;
      }

      return this.normalizeCurso(snapshot.data() as RawCurso, snapshot.id);
    } catch (error) {
      console.error('Error obteniendo curso:', error);
      return null;
    }
  }

  async addPersonaToCurso(cursoId: string, personaId: string): Promise<void> {
    const normalizedCursoId = this.normalizeString(cursoId);
    const normalizedPersonaId = this.normalizeString(personaId);
    if (!normalizedCursoId || !normalizedPersonaId) {
      throw new Error('Curso o persona invalida');
    }

    const cursoDoc = doc(this.firestore, `cursos/${normalizedCursoId}`);
    const personaDoc = doc(this.firestore, `personas/${normalizedPersonaId}`);

    try {
      await runTransaction(this.firestore, async (transaction) => {
        const cursoSnapshot = await transaction.get(cursoDoc);
        if (!cursoSnapshot.exists()) {
          throw new Error('Curso no encontrado');
        }

        const personaSnapshot = await transaction.get(personaDoc);
        if (!personaSnapshot.exists()) {
          throw new Error('Persona no encontrada');
        }

        const curso = this.normalizeCurso(cursoSnapshot.data() as RawCurso, cursoSnapshot.id);
        const currentPersonasIds = this.normalizeIdList(curso.personasIds);

        if (currentPersonasIds.includes(normalizedPersonaId)) {
          return;
        }

        const personaRaw = personaSnapshot.data() as Partial<Persona>;
        const personaCursoIds = this.normalizeIdList(personaRaw.cursoIds);
        const assignedCursoId = this.normalizeString(personaRaw.assignedCursoId || '');

        const assignedElsewhere = (!!assignedCursoId && assignedCursoId !== normalizedCursoId)
          || personaCursoIds.some((id) => id && id !== normalizedCursoId);

        if (assignedElsewhere) {
          throw new Error('La persona ya esta asignada a otro curso');
        }

        const personasIds = Array.from(new Set([...currentPersonasIds, normalizedPersonaId]));
        const cursoIds = Array.from(new Set([...personaCursoIds, normalizedCursoId]));

        transaction.update(cursoDoc, { personasIds });
        transaction.set(personaDoc, {
          cursoIds,
          assignedCursoId: normalizedCursoId,
          assignmentStatus: 'assigned'
        }, { merge: true });
      });
    } catch (error) {
      console.error('Error agregando persona al curso:', error);
      throw error;
    }
  }

  async removePersonaFromCurso(cursoId: string, personaId: string): Promise<void> {
    const normalizedCursoId = this.normalizeString(cursoId);
    const normalizedPersonaId = this.normalizeString(personaId);
    if (!normalizedCursoId || !normalizedPersonaId) {
      return;
    }

    const cursoDoc = doc(this.firestore, `cursos/${normalizedCursoId}`);
    const personaDoc = doc(this.firestore, `personas/${normalizedPersonaId}`);

    try {
      await runTransaction(this.firestore, async (transaction) => {
        const cursoSnapshot = await transaction.get(cursoDoc);
        if (!cursoSnapshot.exists()) {
          return;
        }

        const curso = this.normalizeCurso(cursoSnapshot.data() as RawCurso, cursoSnapshot.id);
        const currentPersonasIds = this.normalizeIdList(curso.personasIds);
        if (!currentPersonasIds.includes(normalizedPersonaId)) {
          return;
        }

        const personasIds = currentPersonasIds.filter((id) => id !== normalizedPersonaId);
        transaction.update(cursoDoc, { personasIds });

        const personaSnapshot = await transaction.get(personaDoc);
        if (!personaSnapshot.exists()) {
          return;
        }

        const personaRaw = personaSnapshot.data() as Partial<Persona>;
        const cursoIds = this.normalizeIdList(personaRaw.cursoIds).filter((id) => id !== normalizedCursoId);
        const assignedCursoId = cursoIds[0] || '';

        transaction.set(personaDoc, {
          cursoIds,
          assignedCursoId,
          assignmentStatus: assignedCursoId ? 'assigned' : 'available'
        }, { merge: true });
      });
    } catch (error) {
      console.error('Error removiendo persona del curso:', error);
      throw error;
    }
  }

  async addPersonasToCurso(
    cursoId: string,
    personaIds: string[]
  ): Promise<{ added: number; skipped: number; errors: number }> {
    const normalizedCursoId = this.normalizeString(cursoId);
    const uniquePersonaIds = Array.from(
      new Set(
        (personaIds || [])
          .map((id) => this.normalizeString(id))
          .filter(Boolean)
      )
    );

    if (!normalizedCursoId || uniquePersonaIds.length === 0) {
      return { added: 0, skipped: 0, errors: 0 };
    }

    let added = 0;
    let skipped = 0;
    let errors = 0;

    for (const personaId of uniquePersonaIds) {
      try {
        await this.addPersonaToCurso(normalizedCursoId, personaId);
        added += 1;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
        if (errorMessage.includes('ya esta asignada a otro curso')) {
          skipped += 1;
        } else {
          errors += 1;
        }
      }
    }

    return { added, skipped, errors };
  }

  async assignInstructoresToCurso(cursoId: string, instructorIds: string[]): Promise<void> {
    const normalizedInstructorIds = this.normalizeInstructorIds(instructorIds);
    this.ensureInstructorCountInRange(normalizedInstructorIds);

    try {
      const cursoDoc = doc(this.firestore, `cursos/${cursoId}`);
      await updateDoc(cursoDoc, { instructorIds: normalizedInstructorIds });
    } catch (error) {
      console.error('Error asignando instructores al curso:', error);
      throw error;
    }
  }

  async addInstructorToCurso(cursoId: string, instructorId: string): Promise<void> {
    const curso = await this.getCursoById(cursoId);

    if (!curso) {
      return;
    }

    const instructorIds = this.normalizeInstructorIds([...(curso.instructorIds || []), instructorId]);
    this.ensureInstructorCountInRange(instructorIds);

    try {
      const cursoDoc = doc(this.firestore, `cursos/${cursoId}`);
      await updateDoc(cursoDoc, { instructorIds });
    } catch (error) {
      console.error('Error agregando instructor al curso:', error);
      throw error;
    }
  }

  async removeInstructorFromCurso(cursoId: string, instructorId: string): Promise<void> {
    const curso = await this.getCursoById(cursoId);

    if (!curso) {
      return;
    }

    const currentInstructorIds = this.normalizeInstructorIds(curso.instructorIds || []);
    const instructorIds = currentInstructorIds.filter((id) => id !== instructorId);
    this.ensureInstructorCountInRange(instructorIds);

    try {
      const cursoDoc = doc(this.firestore, `cursos/${cursoId}`);
      await updateDoc(cursoDoc, { instructorIds });
    } catch (error) {
      console.error('Error removiendo instructor del curso:', error);
      throw error;
    }
  }

  private async getCursosByPersonaId(personaId: string): Promise<Curso[]> {
    try {
      const q = query(this.cursosCollection, where('personasIds', 'array-contains', personaId));
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map((cursoDoc) => ({
        ...this.normalizeCurso(cursoDoc.data() as RawCurso, cursoDoc.id)
      }));
    } catch (error) {
      console.error('Error buscando curso por persona:', error);
      return [];
    }
  }

  private normalizeInstructorIds(instructorIds?: unknown): string[] {
    return this.normalizeIdList(instructorIds);
  }

  private ensureInstructorCountInRange(instructorIds: string[]): void {
    if (instructorIds.length < this.MIN_INSTRUCTORES || instructorIds.length > this.MAX_INSTRUCTORES) {
      throw new Error(
        `El curso debe tener entre ${this.MIN_INSTRUCTORES} y ${this.MAX_INSTRUCTORES} instructores`
      );
    }
  }

  private normalizeCurso(curso: RawCurso, idcursoOverride?: string): Curso {
    const inicio = coerceDate(curso.Fecha_inicio ?? curso.fecha_inicio);
    const fin = coerceDate(curso.Fecha_fin ?? curso.fecha_fin);
    const createdAt = coerceDate(curso.createdAt);
    const anioCurso = this.resolveCursoYear(
      curso.anioCurso ?? curso.anio_curso ?? curso.anio ?? curso.year,
      inicio,
      createdAt
    );
    const mesCurso = this.resolveCursoMonth(
      curso.mesCurso ?? curso.mes_curso ?? curso.mes ?? curso.month,
      inicio,
      createdAt
    );

    return {
      idcurso: idcursoOverride || curso.idcurso,
      nombre: this.normalizeString(curso.nombre),
      descripcion: this.normalizeString(curso.descripcion),
      anioCurso,
      mesCurso,
      Fecha_inicio: inicio,
      Fecha_fin: fin,
      nom_representante: this.normalizeString(
        curso.nom_representante ?? curso.nomRepresentante ?? curso.representante
      ),
      num_represnetantes: this.normalizeString(
        curso.num_represnetantes ?? curso.num_representantes ?? curso.telefono_representante
      ),
      companyTag: this.normalizeOptionalString(curso.companyTag ?? curso.company_tag),
      personasIds: this.normalizeIdList(curso.personasIds ?? curso.personas_ids),
      instructorIds: this.normalizeInstructorIds(curso.instructorIds ?? curso.instructor_ids),
      archivos: this.normalizeArchivosFromRaw(curso.archivos ?? curso.files ?? curso.documentos),
      createdAt,
      createdBy: this.normalizeOptionalString(curso.createdBy)
    };
  }

  private normalizeArchivosFromRaw(value: unknown): CursoArchivo[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const normalized: CursoArchivo[] = [];
    for (const archivo of value) {
      const normalizedArchivo = this.normalizeArchivoFromRaw(archivo);
      if (normalizedArchivo) {
        normalized.push(normalizedArchivo);
      }
    }

    return normalized;
  }

  private normalizeArchivoFromRaw(value: unknown): CursoArchivo | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const archivo = value as Partial<CursoArchivoInput>;
    const nombre = this.normalizeString(archivo.nombre);
    const url = this.normalizeAttachmentUrl(archivo.url);

    if (!nombre || !url) {
      return null;
    }

    return {
      nombre,
      url,
      tipo: this.normalizeString(archivo.tipo) || 'application/octet-stream',
      uploadedAt: normalizeDateInput(archivo.uploadedAt),
      size: this.normalizeNumberValue(archivo.size),
      storagePath: this.normalizeOptionalString(archivo.storagePath)
    };
  }

  private async prepareCursoForFirestore(
    curso: Partial<Curso>,
    cursoId: string,
    uploadedStoragePaths: string[]
  ): Promise<Curso> {
    const normalizedArchivos = await this.normalizeArchivos(cursoId, curso.archivos, uploadedStoragePaths);
    const normalizedInstructorIds = this.normalizeInstructorIds(curso.instructorIds);
    const normalizedPersonasIds = this.normalizeIdList(curso.personasIds);
    const inicio = coerceDate(curso.Fecha_inicio);
    const fin = coerceDate(curso.Fecha_fin);
    const createdAt = normalizeDateInput(curso.createdAt, new Date()) ?? new Date();
    const anioCurso = this.resolveCursoYear(curso.anioCurso, inicio, createdAt);
    const mesCurso = this.resolveCursoMonth(curso.mesCurso, inicio, createdAt);

    return {
      nombre: this.normalizeString(curso.nombre),
      descripcion: this.normalizeString(curso.descripcion),
      anioCurso,
      mesCurso,
      Fecha_inicio: inicio,
      Fecha_fin: fin,
      nom_representante: this.normalizeString(curso.nom_representante),
      num_represnetantes: this.normalizeString(curso.num_represnetantes),
      companyTag: this.normalizeCompanyTag(curso.companyTag),
      personasIds: normalizedPersonasIds,
      instructorIds: normalizedInstructorIds,
      archivos: normalizedArchivos,
      createdAt,
      createdBy: this.normalizeOptionalString(curso.createdBy)
    };
  }

  private async normalizeArchivos(
    cursoId: string,
    archivos: CursoArchivoInput[] | undefined,
    uploadedStoragePaths: string[]
  ): Promise<CursoArchivo[]> {
    const normalizedArchivos: CursoArchivo[] = [];

    for (const archivo of archivos || []) {
      const normalizedArchivo = await this.normalizeArchivo(cursoId, archivo, uploadedStoragePaths);
      if (normalizedArchivo) {
        normalizedArchivos.push(normalizedArchivo);
      }
    }

    return normalizedArchivos;
  }

  private async normalizeArchivo(
    cursoId: string,
    archivo: CursoArchivoInput | undefined,
    uploadedStoragePaths: string[]
  ): Promise<CursoArchivo | null> {
    if (!archivo) {
      return null;
    }

    if (archivo.file) {
      return await this.uploadArchivo(cursoId, archivo, uploadedStoragePaths);
    }

    const nombre = this.normalizeString(archivo.nombre);
    const url = this.normalizeAttachmentUrl(archivo.url);

    if (!nombre || !url) {
      return null;
    }

    return {
      nombre,
      url,
      tipo: this.normalizeString(archivo.tipo) || 'application/octet-stream',
      uploadedAt: normalizeDateInput(archivo.uploadedAt),
      size: this.normalizeNumberValue(archivo.size),
      storagePath: this.normalizeOptionalString(archivo.storagePath)
    };
  }

  private async uploadArchivo(
    cursoId: string,
    archivo: CursoArchivoInput,
    uploadedStoragePaths: string[]
  ): Promise<CursoArchivo | null> {
    const file = archivo.file;
    if (!file) {
      return null;
    }

    const nombre = this.normalizeString(archivo.nombre || file.name);
    if (!nombre) {
      return null;
    }

    const contentType = this.resolveAttachmentContentType(file, archivo.tipo);
    if (!contentType) {
      throw new Error('Solo se permiten archivos PDF');
    }

    const storagePath = this.getAttachmentStoragePath(cursoId, file.name || nombre);
    const storageRef = ref(this.storage, storagePath);
    const uploadResult = await uploadBytes(storageRef, file, { contentType });
    const url = await getDownloadURL(uploadResult.ref);

    uploadedStoragePaths.push(storagePath);

    return {
      nombre,
      url,
      tipo: this.normalizeString(file.type || archivo.tipo) || 'application/octet-stream',
      uploadedAt: normalizeDateInput(archivo.uploadedAt, new Date()) ?? new Date(),
      size: this.normalizeNumberValue(file.size ?? archivo.size),
      storagePath
    };
  }

  private resolveAttachmentContentType(file: File, fallbackType?: string): string {
    const normalizedType = this.normalizeString(file.type || fallbackType).toLowerCase();
    if (normalizedType === 'application/pdf') {
      return normalizedType;
    }

    if (file.name.toLowerCase().endsWith('.pdf')) {
      return 'application/pdf';
    }

    return '';
  }

  private getAttachmentStoragePath(cursoId: string, fileName: string): string {
    const uniqueName = this.createSafeFileName(fileName);
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    return `${this.STORAGE_ROOT}/${cursoId}/${this.STORAGE_FILES_FOLDER}/${Date.now()}-${randomSuffix}-${uniqueName}`;
  }

  private createSafeFileName(fileName: string): string {
    const normalized = this.normalizeString(fileName).toLowerCase();
    const segments = normalized.split('.');
    const extension = segments.length > 1 ? segments.pop() || '' : '';
    const baseName = segments.join('.').trim() || 'archivo';

    const safeBase = baseName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'archivo';

    const safeExtension = extension
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');

    return safeExtension ? `${safeBase}.${safeExtension}` : safeBase;
  }

  private getStoragePathsFromArchivos(archivos: CursoArchivo[] | undefined): string[] {
    return [...new Set(
      (archivos || [])
        .map((archivo) => this.getStoragePathFromArchivo(archivo))
        .filter((storagePath): storagePath is string => !!storagePath)
    )];
  }

  private getStoragePathFromArchivo(archivo: CursoArchivo): string | undefined {
    const explicitStoragePath = this.normalizeString(archivo.storagePath);
    if (explicitStoragePath) {
      return explicitStoragePath;
    }

    return this.extractStoragePathFromUrl(this.normalizeString(archivo.url));
  }

  private extractStoragePathFromUrl(url: string): string | undefined {
    if (!url) return undefined;

    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();

      if (host === 'firebasestorage.googleapis.com') {
        const match = parsed.pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/);
        if (match?.[1]) {
          try {
            return decodeURIComponent(match[1]);
          } catch {
            return match[1];
          }
        }
      }

      if (host === 'storage.googleapis.com') {
        const match = parsed.pathname.match(/^\/[^/]+\/(.+)$/);
        if (match?.[1]) {
          try {
            return decodeURIComponent(match[1]);
          } catch {
            return match[1];
          }
        }
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  private getRemovedStoragePaths(
    existingArchivos: CursoArchivo[] | undefined,
    nextArchivos: CursoArchivo[] | undefined
  ): string[] {
    const nextStoragePaths = new Set(this.getStoragePathsFromArchivos(nextArchivos));

    return this.getStoragePathsFromArchivos(existingArchivos).filter(
      (storagePath) => !nextStoragePaths.has(storagePath)
    );
  }

  private async deleteStoragePaths(storagePaths: string[]): Promise<void> {
    const uniquePaths = [...new Set(storagePaths.filter(Boolean))];

    for (const storagePath of uniquePaths) {
      try {
        await deleteObject(ref(this.storage, storagePath));
      } catch (error) {
        console.warn('No se pudo eliminar el archivo en Storage:', storagePath, error);
      }
    }
  }

  private ensureDocumentSize(payload: Record<string, unknown>, action: 'agregar' | 'actualizar'): void {
    const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;

    if (bytes > this.MAX_DOCUMENT_SIZE_BYTES) {
      const sizeKb = Math.ceil(bytes / 1024);
      throw new Error(
        `No se puede ${action} el curso porque el documento es demasiado grande (${sizeKb} KB). Firestore permite un maximo de 1 MB por documento.`
      );
    }
  }

  private normalizeIdList(value: unknown): string[] {
    if (Array.isArray(value)) {
      return Array.from(
        new Set(
          value
            .map((item) => this.normalizeOptionalString(item))
            .filter((item): item is string => !!item)
        )
      );
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return [];

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          return this.normalizeIdList(parsed);
        } catch {
          return [trimmed];
        }
      }

      const chunks = trimmed
        .split(/[;,]/)
        .map((item) => item.trim())
        .filter(Boolean);

      return chunks.length > 1 ? Array.from(new Set(chunks)) : [trimmed];
    }

    if (typeof value === 'number') {
      return [String(value)];
    }

    return [];
  }

  private normalizeString(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    return '';
  }

  private normalizeOptionalString(value: unknown): string | undefined {
    const normalized = this.normalizeString(value);
    return normalized || undefined;
  }

  private normalizeNumberValue(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }

  private normalizeYearValue(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return undefined;
    }

    const normalized = Math.floor(numeric);
    return normalized >= 2000 && normalized <= 2100 ? normalized : undefined;
  }

  private normalizeMonthValue(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return undefined;
    }

    const normalized = Math.floor(numeric);
    return normalized >= 1 && normalized <= 12 ? normalized : undefined;
  }

  private resolvePeriodRange(
    startYearValue: unknown,
    startMonthValue: unknown,
    endYearValue: unknown,
    endMonthValue: unknown
  ): PeriodRange | null {
    const startYear = this.normalizeYearValue(startYearValue);
    const startMonth = this.normalizeMonthValue(startMonthValue);
    const endYear = this.normalizeYearValue(endYearValue);
    const endMonth = this.normalizeMonthValue(endMonthValue);

    if (!startYear || !startMonth || !endYear || !endMonth) {
      return null;
    }

    const startKey = this.toPeriodKey(startYear, startMonth);
    const endKey = this.toPeriodKey(endYear, endMonth);
    if (startKey === null || endKey === null) {
      return null;
    }

    const normalizedStart = startKey <= endKey
      ? { year: startYear, month: startMonth, key: startKey }
      : { year: endYear, month: endMonth, key: endKey };
    const normalizedEnd = startKey <= endKey
      ? { year: endYear, month: endMonth, key: endKey }
      : { year: startYear, month: startMonth, key: startKey };

    return {
      startYear: normalizedStart.year,
      startMonth: normalizedStart.month,
      endYear: normalizedEnd.year,
      endMonth: normalizedEnd.month,
      startKey: normalizedStart.key,
      endKey: normalizedEnd.key,
      rangeStart: new Date(normalizedStart.year, normalizedStart.month - 1, 1, 0, 0, 0, 0),
      rangeEnd: new Date(normalizedEnd.year, normalizedEnd.month, 0, 23, 59, 59, 999)
    };
  }

  private toPeriodKey(yearValue: unknown, monthValue: unknown): number | null {
    const year = this.normalizeYearValue(yearValue);
    const month = this.normalizeMonthValue(monthValue);
    if (!year || !month) {
      return null;
    }

    return (year * 100) + month;
  }

  private resolveCursoYear(
    explicitYear: unknown,
    inicio?: Date | null,
    createdAt?: Date | null
  ): number | undefined {
    const byField = this.normalizeYearValue(explicitYear);
    if (byField) return byField;

    const byInicio = this.normalizeYearValue(inicio?.getFullYear());
    if (byInicio) return byInicio;

    return this.normalizeYearValue(createdAt?.getFullYear());
  }

  private resolveCursoMonth(
    explicitMonth: unknown,
    inicio?: Date | null,
    createdAt?: Date | null
  ): number | undefined {
    const byField = this.normalizeMonthValue(explicitMonth);
    if (byField) return byField;

    const byInicio = this.normalizeMonthValue((inicio?.getMonth() ?? -1) + 1);
    if (byInicio) return byInicio;

    return this.normalizeMonthValue((createdAt?.getMonth() ?? -1) + 1);
  }

  private normalizeAttachmentUrl(value: unknown): string {
    const normalized = this.normalizeString(value);
    if (!normalized) return '';

    const protocol = this.getUrlProtocol(normalized);
    if (protocol === 'javascript:' || protocol === 'file:' || protocol === 'vbscript:' || protocol === 'blob:') {
      return '';
    }

    return normalized;
  }

  private normalizeCompanyTag(tag?: string): string | undefined {
    const normalized = (tag || '').trim().toLowerCase();
    return normalized || undefined;
  }

  private sanitizeForFirestore(value: unknown): unknown {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (value instanceof Date) return value;

    if (Array.isArray(value)) {
      return value
        .map((item) => this.sanitizeForFirestore(item))
        .filter((item) => item !== undefined);
    }

    if (typeof value === 'object') {
      const sanitizedObject: Record<string, unknown> = {};

      for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
        const sanitizedValue = this.sanitizeForFirestore(nestedValue);
        if (sanitizedValue !== undefined) {
          sanitizedObject[key] = sanitizedValue;
        }
      }

      return sanitizedObject;
    }

    return value;
  }

  private getUrlProtocol(url: string): string {
    const normalized = this.normalizeString(url);
    if (!normalized) return '';

    try {
      return new URL(normalized, window.location.origin).protocol.toLowerCase();
    } catch {
      return '';
    }
  }
}
