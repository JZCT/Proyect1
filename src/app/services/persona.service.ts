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
  writeBatch,
  query,
  where,
  getDocs,
  limit,
  documentId
} from '@angular/fire/firestore';
import {
  Storage,
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes
} from '@angular/fire/storage';
import { Observable, combineLatest, map } from 'rxjs';
import { Persona, PersonaArchivo } from '../models/persona.model';
import { normalizeDateInput } from '../utils/date.util';

type RawPersona = Partial<Persona> & {
  id?: string;
  created_at?: unknown;
  anioPersona?: unknown;
  anio_persona?: unknown;
  anio?: unknown;
  year?: unknown;
  mesPersona?: unknown;
  mes_persona?: unknown;
  mes?: unknown;
  month?: unknown;
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

@Injectable({
  providedIn: 'root'
})
export class PersonaService {
  private readonly MAX_DOCUMENT_SIZE_BYTES = 900_000;
  private readonly STORAGE_ROOT = 'personas';
  private readonly STORAGE_FILES_FOLDER = 'archivos';
  private readonly DEFAULT_SEARCH_LIMIT = 200;
  private readonly MAX_SEARCH_LIMIT = 500;
  private personasCollection;

  constructor(private firestore: Firestore, private storage: Storage) {
    this.personasCollection = collection(this.firestore, 'personas');
  }

  getPersonas(): Observable<Persona[]> {
    return collectionData(this.personasCollection, { idField: 'id' }).pipe(
      map((rows) =>
        (rows as RawPersona[])
          .map((row) => this.normalizePersonaFromRaw(row, row.id))
      )
    );
  }

  getPersonasByPeriod(filters?: {
    year?: number | null;
    month?: number | null;
    startYear?: number | null;
    startMonth?: number | null;
    endYear?: number | null;
    endMonth?: number | null;
  }): Observable<Persona[]> {
    const normalizedYear = this.normalizeYearValue(filters?.year);
    const normalizedMonth = this.normalizeMonthValue(filters?.month);
    const explicitRange = this.resolvePeriodRange(
      filters?.startYear,
      filters?.startMonth,
      filters?.endYear,
      filters?.endMonth
    );

    if (!explicitRange && !normalizedYear) {
      return this.getPersonas();
    }

    const effectiveRange = explicitRange || this.resolvePeriodRange(
      normalizedYear,
      normalizedMonth || 1,
      normalizedYear,
      normalizedMonth || 12
    );
    if (!effectiveRange) {
      return this.getPersonas();
    }

    const personasByNormalizedFields$ = collectionData(
      query(
        this.personasCollection,
        where('anioPersona', '>=', effectiveRange.startYear),
        where('anioPersona', '<=', effectiveRange.endYear)
      ),
      { idField: 'id' }
    ) as Observable<RawPersona[]>;

    const personasByCreatedAt$ = collectionData(
      query(
        this.personasCollection,
        where('createdAt', '>=', effectiveRange.rangeStart),
        where('createdAt', '<=', effectiveRange.rangeEnd)
      ),
      { idField: 'id' }
    ) as Observable<RawPersona[]>;

    const personasByCreatedAtLegacy$ = collectionData(
      query(
        this.personasCollection,
        where('created_at', '>=', effectiveRange.rangeStart),
        where('created_at', '<=', effectiveRange.rangeEnd)
      ),
      { idField: 'id' }
    ) as Observable<RawPersona[]>;

    return combineLatest([
      personasByNormalizedFields$,
      personasByCreatedAt$,
      personasByCreatedAtLegacy$
    ]).pipe(
      map(([rowsByFields, rowsByCreatedAt, rowsByCreatedAtLegacy]) => {
        const deduped = new Map<string, Persona>();
        let fallbackIndex = 0;

        for (const row of [...rowsByFields, ...rowsByCreatedAt, ...rowsByCreatedAtLegacy]) {
          const normalized = this.normalizePersonaFromRaw(row, row.id);
          const resolvedYear = this.resolvePersonaYear(normalized.anioPersona, normalized.createdAt);
          const resolvedMonth = this.resolvePersonaMonth(normalized.mesPersona, normalized.createdAt);
          const periodKey = this.toPeriodKey(resolvedYear, resolvedMonth);

          if (periodKey === null || periodKey < effectiveRange.startKey || periodKey > effectiveRange.endKey) {
            continue;
          }

          const id = normalized.id || `persona-sin-id-${fallbackIndex++}`;
          if (!deduped.has(id)) {
            deduped.set(id, normalized);
          }
        }

        return [...deduped.values()];
      })
    );
  }

  async getPersonasByCursoId(cursoId: string, maxResults = this.DEFAULT_SEARCH_LIMIT): Promise<Persona[]> {
    const normalizedCursoId = this.normalizeTextValue(cursoId);
    if (!normalizedCursoId) {
      return [];
    }

    try {
      const q = query(
        this.personasCollection,
        where('assignedCursoId', '==', normalizedCursoId),
        limit(this.clampLimit(maxResults))
      );
      const snapshot = await getDocs(q);

      return snapshot.docs.map((row) => this.normalizePersonaFromRaw(row.data() as RawPersona, row.id));
    } catch (error) {
      console.error('Error obteniendo personas del curso:', error);
      return [];
    }
  }

  async getPersonasByIds(personaIds: string[]): Promise<Persona[]> {
    const uniqueIds = Array.from(
      new Set((personaIds || []).map((id) => this.normalizeTextValue(id)).filter(Boolean))
    );
    if (uniqueIds.length === 0) {
      return [];
    }

    try {
      const chunkSize = 30;
      const all: Persona[] = [];

      for (let index = 0; index < uniqueIds.length; index += chunkSize) {
        const chunk = uniqueIds.slice(index, index + chunkSize);
        const q = query(this.personasCollection, where(documentId(), 'in', chunk));
        const snapshot = await getDocs(q);
        all.push(
          ...snapshot.docs.map((row) => this.normalizePersonaFromRaw(row.data() as RawPersona, row.id))
        );
      }

      return all;
    } catch (error) {
      console.error('Error obteniendo personas por IDs:', error);
      return [];
    }
  }

  async searchAvailablePersonas(params: {
    companyTag: string;
    term?: string;
    maxResults?: number;
  }): Promise<Persona[]> {
    const normalizedCompanyTag = this.normalizeCompanyTag(params.companyTag || '');
    if (!normalizedCompanyTag) {
      return [];
    }

    const normalizedTerm = this.normalizeSearchValue(params.term || '');
    const queryToken = this.pickQueryToken(normalizedTerm);
    const requestLimit = this.clampLimit(params.maxResults);
    const q = queryToken
      ? query(
          this.personasCollection,
          where('companyTag', '==', normalizedCompanyTag),
          where('assignmentStatus', '==', 'available'),
          where('searchTokens', 'array-contains', queryToken),
          limit(requestLimit)
        )
      : query(
          this.personasCollection,
          where('companyTag', '==', normalizedCompanyTag),
          where('assignmentStatus', '==', 'available'),
          limit(requestLimit)
        );

    const legacyQ = queryToken
      ? query(
          this.personasCollection,
          where('companyTag', '==', normalizedCompanyTag),
          where('searchTokens', 'array-contains', queryToken),
          limit(requestLimit)
        )
      : query(
          this.personasCollection,
          where('companyTag', '==', normalizedCompanyTag),
          limit(requestLimit)
        );

    try {
      const [snapshot, legacySnapshot] = await Promise.all([getDocs(q), getDocs(legacyQ)]);
      const deduped = new Map<string, Persona>();

      for (const row of [...snapshot.docs, ...legacySnapshot.docs]) {
        const normalized = this.normalizePersonaFromRaw(row.data() as RawPersona, row.id);
        if (!normalized.id) continue;
        deduped.set(normalized.id, normalized);
      }

      const personas = [...deduped.values()].filter((persona) => this.isAvailablePersona(persona));
      if (!normalizedTerm) {
        return personas.slice(0, requestLimit);
      }

      const termTokens = this.tokenizeSearch(normalizedTerm);
      return personas.filter((persona) =>
        this.includesEveryToken(persona.searchTokens || [], termTokens)
      ).slice(0, requestLimit);
    } catch (error) {
      console.error('Error buscando personas disponibles:', error);
      return [];
    }
  }

  async findAutoAssignablePersonas(params: {
    companyTag: string;
    locationTerm: string;
    maxResults?: number;
  }): Promise<Persona[]> {
    const normalizedCompanyTag = this.normalizeCompanyTag(params.companyTag || '');
    const normalizedLocation = this.normalizeSearchValue(params.locationTerm || '');

    if (!normalizedCompanyTag || !normalizedLocation) {
      return [];
    }

    const location = this.parseLocation(normalizedLocation);
    if (!location.raw) {
      return [];
    }

    try {
      const requestLimit = this.clampLimit(params.maxResults);
      const byExactCityState = location.city && location.state
        ? await getDocs(query(
            this.personasCollection,
            where('companyTag', '==', normalizedCompanyTag),
            where('assignmentStatus', '==', 'available'),
            where('locationCity', '==', location.city),
            where('locationState', '==', location.state),
            limit(requestLimit)
          ))
        : null;

      const tokenFallback = location.tokens[0]
        ? await getDocs(query(
            this.personasCollection,
            where('companyTag', '==', normalizedCompanyTag),
            where('assignmentStatus', '==', 'available'),
            where('locationTokens', 'array-contains', location.tokens[0]),
            limit(requestLimit)
          ))
        : null;

      const legacyByExactCityState = location.city && location.state
        ? await getDocs(query(
            this.personasCollection,
            where('companyTag', '==', normalizedCompanyTag),
            where('locationCity', '==', location.city),
            where('locationState', '==', location.state),
            limit(requestLimit)
          ))
        : null;

      const legacyTokenFallback = location.tokens[0]
        ? await getDocs(query(
            this.personasCollection,
            where('companyTag', '==', normalizedCompanyTag),
            where('locationTokens', 'array-contains', location.tokens[0]),
            limit(requestLimit)
          ))
        : null;

      const docs = [
        ...(byExactCityState?.docs || []),
        ...(tokenFallback?.docs || []),
        ...(legacyByExactCityState?.docs || []),
        ...(legacyTokenFallback?.docs || [])
      ];
      const deduped = new Map<string, Persona>();

      for (const row of docs) {
        const normalized = this.normalizePersonaFromRaw(row.data() as RawPersona, row.id);
        if (!normalized.id) continue;
        deduped.set(normalized.id, normalized);
      }

      const personas = [...deduped.values()];
      return personas.filter((persona) => {
        if (!this.isAvailablePersona(persona)) return false;
        if (this.normalizeCompanyTag(persona.companyTag || persona.empresa || '') !== normalizedCompanyTag) return false;

        const personaLocation = this.parseLocation(this.normalizeSearchValue(persona.lugar || ''));

        if (location.city && location.state) {
          return personaLocation.city === location.city && personaLocation.state === location.state;
        }

        return this.includesEveryToken(persona.locationTokens || [], location.tokens);
      }).slice(0, requestLimit);
    } catch (error) {
      console.error('Error buscando personas para autoasignacion:', error);
      return [];
    }
  }

  async addPersona(persona: Persona): Promise<void> {
    const personaDoc = doc(this.personasCollection);
    const uploadedStoragePaths: string[] = [];

    try {
      const preparedPersona = await this.preparePersonaForFirestore({
        ...persona,
        createdAt: new Date(),
        cursoIds: persona.cursoIds || []
      }, personaDoc.id, uploadedStoragePaths);

      const payload = this.sanitizeForFirestore(preparedPersona) as Record<string, unknown>;
      this.ensureDocumentSize(payload, 'agregar');

      await setDoc(personaDoc, payload as any);
    } catch (error) {
      await this.deleteStoragePaths(uploadedStoragePaths);
      console.error('Error agregando persona:', error);
      throw error;
    }
  }

  async updatePersona(id: string, persona: Partial<Persona>): Promise<void> {
    const personaDoc = doc(this.firestore, `personas/${id}`);
    const uploadedStoragePaths: string[] = [];

    try {
      const existingPersona = await this.getPersonaById(id);
      const preparedPersona = await this.preparePersonaForFirestore({
        ...(existingPersona || {}),
        ...persona
      }, id, uploadedStoragePaths);

      const payload = this.sanitizeForFirestore(preparedPersona) as Record<string, unknown>;
      if (Object.keys(payload).length === 0) return;

      this.ensureDocumentSize(payload, 'actualizar');
      await setDoc(personaDoc, payload as any, { merge: true });

      const removedStoragePaths = this.getRemovedStoragePaths(existingPersona?.archivos, preparedPersona.archivos);
      await this.deleteStoragePaths(removedStoragePaths);
    } catch (error) {
      await this.deleteStoragePaths(uploadedStoragePaths);
      console.error('Error actualizando persona:', error);
      throw error;
    }
  }

  async deletePersona(id: string): Promise<void> {
    try {
      const persona = await this.getPersonaById(id);
      await deleteDoc(doc(this.firestore, `personas/${id}`));
      await this.deleteStoragePaths(this.getStoragePathsFromArchivos(persona?.archivos));
    } catch (error) {
      console.error('Error eliminando persona:', error);
      throw error;
    }
  }

  async deletePersonas(ids: string[]): Promise<void> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return;
    }

    try {
      const personas = await Promise.all(uniqueIds.map((id) => this.getPersonaById(id)));
      const storagePaths = personas.flatMap((persona) => this.getStoragePathsFromArchivos(persona?.archivos));
      const chunkSize = 450;

      for (let index = 0; index < uniqueIds.length; index += chunkSize) {
        const chunk = uniqueIds.slice(index, index + chunkSize);
        const batch = writeBatch(this.firestore);

        for (const id of chunk) {
          batch.delete(doc(this.firestore, `personas/${id}`));
        }

        await batch.commit();
      }

      await this.deleteStoragePaths(storagePaths);
    } catch (error) {
      console.error('Error eliminando personas en lote:', error);
      throw error;
    }
  }

  async getPersonaByEmail(email: string): Promise<Persona | null> {
    try {
      const q = query(this.personasCollection, where('email', '==', email));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const row = querySnapshot.docs[0];
        return this.normalizePersonaFromRaw(row.data() as RawPersona, row.id);
      }

      return null;
    } catch (error) {
      console.error('Error obteniendo persona:', error);
      return null;
    }
  }

  async assignToCurso(personaId: string, cursoId: string): Promise<void> {
    try {
      const personaDoc = doc(this.firestore, `personas/${personaId}`);
      const persona = await this.getPersonaById(personaId);

      if (!persona) return;

      const cursoIds = [...new Set([...(persona.cursoIds || []), cursoId].map((item) => this.normalizeTextValue(item)).filter(Boolean))];
      await updateDoc(personaDoc, {
        cursoIds,
        assignedCursoId: this.normalizeTextValue(cursoId),
        assignmentStatus: 'assigned'
      });
    } catch (error) {
      console.error('Error asignando persona a curso:', error);
      throw error;
    }
  }

  async removeFromCurso(personaId: string, cursoId: string): Promise<void> {
    try {
      const personaDoc = doc(this.firestore, `personas/${personaId}`);
      const persona = await this.getPersonaById(personaId);

      if (!persona) return;

      const cursoIds = (persona.cursoIds || []).filter((id) => id !== cursoId);
      await updateDoc(personaDoc, {
        cursoIds,
        assignedCursoId: cursoIds[0] || '',
        assignmentStatus: cursoIds.length > 0 ? 'assigned' : 'available'
      });
    } catch (error) {
      console.error('Error removiendo persona de curso:', error);
      throw error;
    }
  }

  private async getPersonaById(id: string): Promise<Persona | null> {
    try {
      const personaDoc = doc(this.firestore, `personas/${id}`);
      const snapshot = await getDoc(personaDoc);

      if (!snapshot.exists()) {
        return null;
      }

      return this.normalizePersonaFromRaw(snapshot.data() as RawPersona, snapshot.id);
    } catch (error) {
      console.error('Error obteniendo persona:', error);
      return null;
    }
  }

  private async preparePersonaForFirestore(
    persona: Partial<Persona>,
    personaId: string,
    uploadedStoragePaths: string[]
  ): Promise<Persona> {
    const normalizedArchivos = await this.normalizeArchivos(personaId, persona.archivos, uploadedStoragePaths);
    const normalizedCursoIds = Array.from(
      new Set((persona.cursoIds || []).map((id) => this.normalizeTextValue(id)).filter(Boolean))
    );
    const normalizedAssignedCursoId = this.normalizeTextValue(
      persona.assignedCursoId || normalizedCursoIds[0] || ''
    );

    if (normalizedAssignedCursoId && !normalizedCursoIds.includes(normalizedAssignedCursoId)) {
      normalizedCursoIds.push(normalizedAssignedCursoId);
    }
    const effectiveAssignedCursoId = normalizedAssignedCursoId || normalizedCursoIds[0] || '';
    const assignmentStatus = effectiveAssignedCursoId ? 'assigned' : 'available';
    const createdAt = normalizeDateInput(persona.createdAt, new Date()) ?? new Date();
    const anioPersona = this.resolvePersonaYear(persona.anioPersona, createdAt);
    const mesPersona = this.resolvePersonaMonth(persona.mesPersona, createdAt);

    const location = this.parseLocation(this.normalizeSearchValue(persona.lugar || ''));
    const searchTokens = this.buildSearchTokens([
      persona.nombre,
      persona.curp,
      persona.email,
      persona.telefono,
      persona.empresa,
      persona.companyTag,
      persona.lugar
    ]);

    return {
      nombre: this.normalizeTextValue(persona.nombre),
      curp: this.normalizeTextValue(persona.curp),
      email: this.normalizeTextValue(persona.email),
      telefono: this.normalizeTextValue(persona.telefono),
      empresa: this.normalizeTextValue(persona.empresa),
      companyTag: this.normalizeCompanyTag(persona.companyTag || persona.empresa || ''),
      lugar: this.normalizeTextValue(persona.lugar),
      foto: this.normalizeAttachmentUrl(persona.foto),
      clfPractica: this.normalizeNumberValue(persona.clfPractica),
      clfTeorica: this.normalizeNumberValue(persona.clfTeorica),
      archivos: normalizedArchivos,
      cursoIds: normalizedCursoIds,
      assignedCursoId: effectiveAssignedCursoId,
      assignmentStatus,
      searchTokens,
      locationTokens: location.tokens,
      locationCity: location.city || '',
      locationState: location.state || '',
      anioPersona,
      mesPersona,
      createdAt
    };
  }

  private async normalizeArchivos(
    personaId: string,
    archivos: PersonaArchivo[] | undefined,
    uploadedStoragePaths: string[]
  ): Promise<PersonaArchivo[]> {
    const normalizedArchivos: PersonaArchivo[] = [];

    for (const archivo of archivos || []) {
      const normalizedArchivo = await this.normalizeArchivo(personaId, archivo, uploadedStoragePaths);
      if (normalizedArchivo) {
        normalizedArchivos.push(normalizedArchivo);
      }
    }

    return normalizedArchivos;
  }

  private ensureDocumentSize(payload: Record<string, unknown>, action: 'agregar' | 'actualizar'): void {
    const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;

    if (bytes > this.MAX_DOCUMENT_SIZE_BYTES) {
      const sizeKb = Math.ceil(bytes / 1024);
      throw new Error(
        `No se puede ${action} la persona porque el documento es demasiado grande (${sizeKb} KB). Firestore permite un maximo de 1 MB por documento. ` +
        'Reduce el tamano de la foto o de los archivos y vuelve a intentar.'
      );
    }
  }

  private normalizeTextValue(value: unknown): string {
    return String(value ?? '').trim();
  }

  private normalizeOptionalTextField(value: unknown): string | undefined {
    const normalized = this.normalizeTextValue(value);
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

  private resolvePersonaYear(explicitYear: unknown, createdAt?: Date | null): number | undefined {
    const byField = this.normalizeYearValue(explicitYear);
    if (byField) return byField;

    return this.normalizeYearValue(createdAt?.getFullYear());
  }

  private resolvePersonaMonth(explicitMonth: unknown, createdAt?: Date | null): number | undefined {
    const byField = this.normalizeMonthValue(explicitMonth);
    if (byField) return byField;

    return this.normalizeMonthValue((createdAt?.getMonth() ?? -1) + 1);
  }

  private normalizeAttachmentUrl(value: unknown): string {
    const normalized = this.normalizeTextValue(value);
    if (!normalized) return '';

    const protocol = this.getUrlProtocol(normalized);
    if (protocol === 'javascript:' || protocol === 'file:' || protocol === 'vbscript:' || protocol === 'blob:') {
      return '';
    }

    return normalized;
  }

  private async normalizeArchivo(
    personaId: string,
    archivo: PersonaArchivo | undefined,
    uploadedStoragePaths: string[]
  ): Promise<PersonaArchivo | null> {
    if (!archivo) {
      return null;
    }

    if (archivo.file) {
      return await this.uploadArchivo(personaId, archivo, uploadedStoragePaths);
    }

    const nombre = this.normalizeTextValue(archivo.nombre);
    const url = this.normalizeAttachmentUrl(archivo.url);

    if (!nombre || !url) {
      return null;
    }

    return {
      nombre,
      url,
      tipo: this.normalizeTextValue(archivo.tipo) || 'application/octet-stream',
      uploadedAt: normalizeDateInput(archivo.uploadedAt),
      size: this.normalizeNumberValue(archivo.size),
      storagePath: this.normalizeOptionalTextField(archivo.storagePath)
    } as PersonaArchivo;
  }

  private async uploadArchivo(
    personaId: string,
    archivo: PersonaArchivo,
    uploadedStoragePaths: string[]
  ): Promise<PersonaArchivo | null> {
    const file = archivo.file;
    if (!file) {
      return null;
    }

    const nombre = this.normalizeTextValue(archivo.nombre || file.name);
    if (!nombre) {
      return null;
    }

    const contentType = this.resolveAttachmentContentType(file, archivo.tipo);
    if (!contentType) {
      throw new Error('Solo se permiten archivos PDF');
    }

    const storagePath = this.getAttachmentStoragePath(personaId, file.name || nombre);
    const storageRef = ref(this.storage, storagePath);
    const uploadResult = await uploadBytes(storageRef, file, {
      contentType
    });
    const url = await getDownloadURL(uploadResult.ref);

    uploadedStoragePaths.push(storagePath);

    return {
      nombre,
      url,
      tipo: this.normalizeTextValue(file.type || archivo.tipo) || 'application/octet-stream',
      uploadedAt: normalizeDateInput(archivo.uploadedAt, new Date()) ?? new Date(),
      size: this.normalizeNumberValue(file.size ?? archivo.size),
      storagePath
    };
  }

  private getAttachmentStoragePath(personaId: string, fileName: string): string {
    const uniqueName = this.createSafeFileName(fileName);
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    return `${this.STORAGE_ROOT}/${personaId}/${this.STORAGE_FILES_FOLDER}/${Date.now()}-${randomSuffix}-${uniqueName}`;
  }

  private createSafeFileName(fileName: string): string {
    const normalized = this.normalizeTextValue(fileName).toLowerCase();
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

  private getStoragePathsFromArchivos(archivos: PersonaArchivo[] | undefined): string[] {
    return [...new Set(
      (archivos || [])
        .map((archivo) => this.getStoragePathFromArchivo(archivo))
        .filter((storagePath): storagePath is string => !!storagePath)
    )];
  }

  private getStoragePathFromArchivo(archivo: PersonaArchivo): string | undefined {
    const explicitStoragePath = this.normalizeTextValue(archivo.storagePath);
    if (explicitStoragePath) {
      return explicitStoragePath;
    }

    return this.extractStoragePathFromUrl(this.normalizeTextValue(archivo.url));
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

  private resolveAttachmentContentType(file: File, fallbackType?: string): string {
    const normalizedType = this.normalizeTextValue(file.type || fallbackType).toLowerCase();
    if (normalizedType === 'application/pdf') {
      return normalizedType;
    }

    if (file.name.toLowerCase().endsWith('.pdf')) {
      return 'application/pdf';
    }

    return '';
  }

  private getRemovedStoragePaths(
    existingArchivos: PersonaArchivo[] | undefined,
    nextArchivos: PersonaArchivo[] | undefined
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

  private getUrlProtocol(url: string): string {
    const normalized = this.normalizeTextValue(url);
    if (!normalized) return '';

    try {
      return new URL(normalized, window.location.origin).protocol.toLowerCase();
    } catch {
      return '';
    }
  }

  private normalizePersonaFromRaw(persona: RawPersona, idOverride?: string): Persona {
    const cursoIds = Array.from(
      new Set((persona.cursoIds || []).map((id) => this.normalizeTextValue(id)).filter(Boolean))
    );
    const assignedCursoId = this.normalizeTextValue(persona.assignedCursoId || cursoIds[0] || '');
    if (assignedCursoId && !cursoIds.includes(assignedCursoId)) {
      cursoIds.push(assignedCursoId);
    }
    const effectiveAssignedCursoId = assignedCursoId || cursoIds[0] || '';
    const assignmentStatus: 'available' | 'assigned' = effectiveAssignedCursoId ? 'assigned' : 'available';

    const lugar = this.normalizeTextValue(persona.lugar);
    const location = this.parseLocation(this.normalizeSearchValue(lugar));
    const companyTag = this.normalizeCompanyTag(persona.companyTag || persona.empresa || '');
    const searchTokens = this.buildSearchTokens([
      persona.nombre,
      persona.curp,
      persona.email,
      persona.telefono,
      persona.empresa,
      companyTag,
      lugar
    ]);
    const createdAt = normalizeDateInput(persona.createdAt ?? persona.created_at);
    const anioPersona = this.resolvePersonaYear(
      persona.anioPersona ?? persona.anio_persona ?? persona.anio ?? persona.year,
      createdAt
    );
    const mesPersona = this.resolvePersonaMonth(
      persona.mesPersona ?? persona.mes_persona ?? persona.mes ?? persona.month,
      createdAt
    );

    return {
      id: idOverride || this.normalizeOptionalTextField(persona.id),
      nombre: this.normalizeTextValue(persona.nombre),
      curp: this.normalizeTextValue(persona.curp),
      email: this.normalizeTextValue(persona.email),
      telefono: this.normalizeOptionalTextField(persona.telefono),
      empresa: this.normalizeOptionalTextField(persona.empresa),
      companyTag,
      lugar: this.normalizeOptionalTextField(lugar),
      foto: this.normalizeOptionalTextField(this.normalizeAttachmentUrl(persona.foto)),
      clfPractica: this.normalizeNumberValue(persona.clfPractica),
      clfTeorica: this.normalizeNumberValue(persona.clfTeorica),
      archivos: persona.archivos || [],
      cursoIds,
      assignedCursoId: effectiveAssignedCursoId,
      assignmentStatus,
      searchTokens,
      locationTokens: location.tokens,
      locationCity: location.city || '',
      locationState: location.state || '',
      anioPersona,
      mesPersona,
      createdAt
    };
  }

  private clampLimit(value?: number): number {
    if (!Number.isFinite(value)) {
      return this.DEFAULT_SEARCH_LIMIT;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return this.DEFAULT_SEARCH_LIMIT;
    }

    return Math.min(Math.max(Math.floor(numeric), 1), this.MAX_SEARCH_LIMIT);
  }

  private normalizeSearchValue(value: string): string {
    return (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tokenizeSearch(value: string): string[] {
    return this.normalizeSearchValue(value)
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);
  }

  private pickQueryToken(value: string): string | null {
    const tokens = this.tokenizeSearch(value);
    if (tokens.length === 0) return null;

    return [...tokens].sort((a, b) => b.length - a.length)[0] || null;
  }

  private includesEveryToken(haystack: string[], needles: string[]): boolean {
    if (needles.length === 0) return true;
    if (haystack.length === 0) return false;

    const normalizedHaystack = new Set(haystack.map((item) => this.normalizeSearchValue(item)).filter(Boolean));
    return needles.every((needle) => normalizedHaystack.has(this.normalizeSearchValue(needle)));
  }

  private buildSearchTokens(values: unknown[]): string[] {
    const allTokens = values.flatMap((value) => this.tokenizeSearch(this.normalizeTextValue(value)));
    return Array.from(new Set(allTokens));
  }

  private parseLocation(value: string): {
    raw: string;
    city: string;
    state: string;
    tokens: string[];
  } {
    const raw = this.normalizeSearchValue(value);
    if (!raw) {
      return { raw: '', city: '', state: '', tokens: [] };
    }

    const segments = raw
      .split(/[;,]+/g)
      .map((segment) => segment.trim().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
      .filter(Boolean);
    const tokens = this.tokenizeSearch(raw).filter((token) => token.length >= 3);

    return {
      raw,
      city: segments[0] || '',
      state: segments.length > 1 ? segments[segments.length - 1] : '',
      tokens: Array.from(new Set(tokens))
    };
  }

  private isAvailablePersona(persona: Partial<Persona>): boolean {
    const assignmentStatus = this.normalizeSearchValue(String(persona.assignmentStatus || ''));
    if (assignmentStatus === 'assigned') {
      return false;
    }

    const assignedCursoId = this.normalizeTextValue(persona.assignedCursoId || '');
    if (assignedCursoId) {
      return false;
    }

    const cursoIds = Array.from(
      new Set((persona.cursoIds || []).map((id) => this.normalizeTextValue(id)).filter(Boolean))
    );

    return cursoIds.length === 0;
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
}
