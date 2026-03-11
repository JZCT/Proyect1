import { Injectable } from '@angular/core';
import {
  Firestore,
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  collectionData,
  deleteDoc,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  QueryDocumentSnapshot,
  query,
  updateDoc,
  where
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Instructor } from '../models/instructor.model';

@Injectable({
  providedIn: 'root'
})
export class InstructorService {
  private instructoresCollection;

  constructor(private firestore: Firestore) {
    this.instructoresCollection = collection(this.firestore, 'instructores');
  }

  getInstructores(): Observable<Instructor[]> {
    return collectionData(this.instructoresCollection, { idField: 'id' }) as Observable<Instructor[]>;
  }

  async addInstructor(instructor: Instructor): Promise<string> {
    try {
      const newInstructor = this.sanitizeInstructorPayload(instructor);
      const docRef = await addDoc(this.instructoresCollection, {
        ...newInstructor,
        cursosIds: newInstructor.cursosIds || [],
        createdAt: new Date()
      });
      return docRef.id;
    } catch (error) {
      console.error('Error agregando instructor:', error);
      throw error;
    }
  }

  async updateInstructor(id: string, instructor: Partial<Instructor>): Promise<void> {
    try {
      const instructorDoc = doc(this.firestore, `instructores/${id}`);
      await updateDoc(instructorDoc, this.sanitizeInstructorPayload(instructor));
    } catch (error) {
      console.error('Error actualizando instructor:', error);
      throw error;
    }
  }

  async deleteInstructor(id: string): Promise<void> {
    try {
      const instructorDoc = doc(this.firestore, `instructores/${id}`);
      await deleteDoc(instructorDoc);
    } catch (error) {
      console.error('Error eliminando instructor:', error);
      throw error;
    }
  }

  async getInstructorById(id: string): Promise<Instructor | null> {
    try {
      const instructorDoc = doc(this.firestore, `instructores/${id}`);
      const snapshot = await getDoc(instructorDoc);

      if (!snapshot.exists()) {
        return null;
      }

      return {
        id: snapshot.id,
        ...(snapshot.data() as Omit<Instructor, 'id'>)
      } as Instructor;
    } catch (error) {
      console.error('Error obteniendo instructor:', error);
      return null;
    }
  }

  async assignInstructorToCurso(instructorId: string, cursoId: string): Promise<void> {
    try {
      if (!cursoId) return;

      const instructorDoc = doc(this.firestore, `instructores/${instructorId}`);
      await updateDoc(instructorDoc, {
        cursosIds: arrayUnion(cursoId)
      });
    } catch (error) {
      console.error('Error asignando instructor a curso:', error);
      throw error;
    }
  }

  async unassignInstructorFromCurso(instructorId: string, cursoId: string): Promise<void> {
    try {
      if (!cursoId) return;

      const instructorDoc = doc(this.firestore, `instructores/${instructorId}`);
      await updateDoc(instructorDoc, {
        cursosIds: arrayRemove(cursoId)
      });
    } catch (error) {
      console.error('Error desasignando instructor de curso:', error);
      throw error;
    }
  }

  async getInstructoresByCurso(cursoId: string): Promise<Instructor[]> {
    try {
      if (!cursoId) return [];

      const q = query(this.instructoresCollection, where('cursosIds', 'array-contains', cursoId));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map((snapshot: QueryDocumentSnapshot<DocumentData>) => ({
        id: snapshot.id,
        ...snapshot.data()
      } as Instructor));
    } catch (error) {
      console.error('Error obteniendo instructores del curso:', error);
      return [];
    }
  }

  private sanitizeInstructorPayload(instructor: Partial<Instructor>): Partial<Instructor> {
    const payload: Partial<Instructor> = { ...instructor };

    if (typeof payload.nombre === 'string') {
      payload.nombre = payload.nombre.trim();
    }

    if (typeof payload.telefono === 'string') {
      payload.telefono = payload.telefono.trim();
    }

    if (Array.isArray(payload.cursosIds)) {
      payload.cursosIds = Array.from(new Set(payload.cursosIds.filter(Boolean)));
    }

    return payload;
  }
}
