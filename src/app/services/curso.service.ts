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
  getDocs
} from '@angular/fire/firestore';
import {
  Storage,
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes
} from '@angular/fire/storage';
import { Observable, map } from 'rxjs';
import { Curso, CursoArchivo } from '../models/curso.model';
import { coerceDate, normalizeDateInput } from '../utils/date.util';

type CursoArchivoInput = NonNullable<Curso['archivos']>[number] & {
  file?: File;
};

type RawCurso = Partial<Curso> & {
  idcurso?: string;
  fecha_inicio?: unknown;
  fecha_fin?: unknown;
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
    try {
      const assignedCursos = await this.getCursosByPersonaId(personaId);
      const assignedElsewhere = assignedCursos.some((curso) => curso.idcurso && curso.idcurso !== cursoId);
      if (assignedElsewhere) {
        throw new Error('La persona ya esta asignada a otro curso');
      }

      const cursoDoc = doc(this.firestore, `cursos/${cursoId}`);
      const curso = await this.getCursoById(cursoId);

      if (curso) {
        const personasIds = Array.from(new Set([...(curso.personasIds || []), personaId]));
        await updateDoc(cursoDoc, { personasIds });
      }
    } catch (error) {
      console.error('Error agregando persona al curso:', error);
      throw error;
    }
  }

  async removePersonaFromCurso(cursoId: string, personaId: string): Promise<void> {
    try {
      const cursoDoc = doc(this.firestore, `cursos/${cursoId}`);
      const curso = await this.getCursoById(cursoId);

      if (curso && curso.personasIds) {
        const personasIds = curso.personasIds.filter((id) => id !== personaId);
        await updateDoc(cursoDoc, { personasIds });
      }
    } catch (error) {
      console.error('Error removiendo persona del curso:', error);
      throw error;
    }
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

    return {
      idcurso: idcursoOverride || curso.idcurso,
      nombre: this.normalizeString(curso.nombre),
      descripcion: this.normalizeString(curso.descripcion),
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

    return {
      nombre: this.normalizeString(curso.nombre),
      descripcion: this.normalizeString(curso.descripcion),
      Fecha_inicio: coerceDate(curso.Fecha_inicio),
      Fecha_fin: coerceDate(curso.Fecha_fin),
      nom_representante: this.normalizeString(curso.nom_representante),
      num_represnetantes: this.normalizeString(curso.num_represnetantes),
      companyTag: this.normalizeCompanyTag(curso.companyTag),
      personasIds: normalizedPersonasIds,
      instructorIds: normalizedInstructorIds,
      archivos: normalizedArchivos,
      createdAt: normalizeDateInput(curso.createdAt, new Date()) ?? new Date(),
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
