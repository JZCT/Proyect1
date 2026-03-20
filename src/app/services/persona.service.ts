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
  getDocs
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Persona, PersonaArchivo } from '../models/persona.model';
import { normalizeDateInput } from '../utils/date.util';

@Injectable({
  providedIn: 'root'
})
export class PersonaService {
  private readonly MAX_DOCUMENT_SIZE_BYTES = 900_000;
  private personasCollection;

  constructor(private firestore: Firestore) {
    this.personasCollection = collection(this.firestore, 'personas');
  }

  getPersonas(): Observable<Persona[]> {
    return collectionData(this.personasCollection, { idField: 'id' }) as Observable<Persona[]>;
  }

  async addPersona(persona: Persona): Promise<void> {
    const personaDoc = doc(this.personasCollection);

    try {
      const preparedPersona = this.preparePersonaForFirestore({
        ...persona,
        createdAt: new Date(),
        cursoIds: persona.cursoIds || []
      });

      const payload = this.sanitizeForFirestore(preparedPersona) as Record<string, unknown>;
      this.ensureDocumentSize(payload, 'agregar');

      await setDoc(personaDoc, payload as any);
    } catch (error) {
      console.error('Error agregando persona:', error);
      throw error;
    }
  }

  async updatePersona(id: string, persona: Partial<Persona>): Promise<void> {
    const personaDoc = doc(this.firestore, `personas/${id}`);

    try {
      const existingPersona = await this.getPersonaById(id);
      const preparedPersona = this.preparePersonaForFirestore({
        ...(existingPersona || {}),
        ...persona
      });

      const payload = this.sanitizeForFirestore(preparedPersona) as Record<string, unknown>;
      if (Object.keys(payload).length === 0) return;

      this.ensureDocumentSize(payload, 'actualizar');
      await setDoc(personaDoc, payload as any, { merge: true });
    } catch (error) {
      console.error('Error actualizando persona:', error);
      throw error;
    }
  }

  async deletePersona(id: string): Promise<void> {
    try {
      await deleteDoc(doc(this.firestore, `personas/${id}`));
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
      const chunkSize = 450;

      for (let index = 0; index < uniqueIds.length; index += chunkSize) {
        const chunk = uniqueIds.slice(index, index + chunkSize);
        const batch = writeBatch(this.firestore);

        for (const id of chunk) {
          batch.delete(doc(this.firestore, `personas/${id}`));
        }

        await batch.commit();
      }
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
        const personaData = querySnapshot.docs[0].data() as Persona;
        return {
          ...personaData,
          id: querySnapshot.docs[0].id
        };
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
      await updateDoc(personaDoc, { cursoIds });
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
      await updateDoc(personaDoc, { cursoIds });
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

      return {
        id: snapshot.id,
        ...(snapshot.data() as Persona)
      };
    } catch (error) {
      console.error('Error obteniendo persona:', error);
      return null;
    }
  }

  private preparePersonaForFirestore(persona: Partial<Persona>): Persona {
    const normalizedArchivos = this.normalizeArchivos(persona.archivos);
    const normalizedCursoIds = Array.from(
      new Set((persona.cursoIds || []).map((id) => this.normalizeTextValue(id)).filter(Boolean))
    );

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
      createdAt: normalizeDateInput(persona.createdAt, new Date()) ?? new Date()
    };
  }

  private normalizeArchivos(archivos: PersonaArchivo[] | undefined): PersonaArchivo[] {
    return (archivos || [])
      .map((archivo) => {
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
          size: this.normalizeNumberValue(archivo.size)
        } as PersonaArchivo;
      })
      .filter((archivo): archivo is PersonaArchivo => archivo !== null);
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

  private normalizeAttachmentUrl(value: unknown): string {
    const normalized = this.normalizeTextValue(value);
    if (!normalized) return '';

    const protocol = this.getUrlProtocol(normalized);
    if (protocol === 'javascript:' || protocol === 'file:' || protocol === 'vbscript:' || protocol === 'blob:') {
      return '';
    }

    return normalized;
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
