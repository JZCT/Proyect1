import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  collectionData,
  doc,
  deleteDoc,
  updateDoc,
  query,
  where,
  getDocs
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Curso } from '../models/curso.model';

@Injectable({
  providedIn: 'root'
})
export class CursoService {
  private cursosCollection;

  constructor(private firestore: Firestore) {
    this.cursosCollection = collection(this.firestore, 'cursos');
  }

  getCursos(): Observable<Curso[]> {
    return collectionData(this.cursosCollection, { idField: 'idcurso' }) as Observable<Curso[]>;
  }

  async addCurso(curso: Curso): Promise<void> {
    try {
      const newCurso = {
        ...curso,
        personasIds: curso.personasIds || [],
        instructorIds: curso.instructorIds || [],
        createdAt: new Date()
      };
      await addDoc(this.cursosCollection, newCurso);
    } catch (error) {
      console.error('Error agregando curso:', error);
      throw error;
    }
  }

  async updateCurso(id: string, curso: Partial<Curso>): Promise<void> {
    try {
      const cursoDoc = doc(this.firestore, `cursos/${id}`);
      await updateDoc(cursoDoc, { ...curso });
    } catch (error) {
      console.error('Error actualizando curso:', error);
      throw error;
    }
  }

  async deleteCurso(id: string): Promise<void> {
    try {
      const cursoDoc = doc(this.firestore, `cursos/${id}`);
      await deleteDoc(cursoDoc);
    } catch (error) {
      console.error('Error eliminando curso:', error);
      throw error;
    }
  }

  async getCursoById(id: string): Promise<Curso | null> {
    try {
      const q = query(this.cursosCollection, where('__name__', '==', id));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        return {
          idcurso: querySnapshot.docs[0].id,
          ...(querySnapshot.docs[0].data() as Curso)
        };
      }
      return null;
    } catch (error) {
      console.error('Error obteniendo curso:', error);
      return null;
    }
  }

  async addPersonaToCurso(cursoId: string, personaId: string): Promise<void> {
    try {
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
        const personasIds = curso.personasIds.filter(id => id !== personaId);
        await updateDoc(cursoDoc, { personasIds });
      }
    } catch (error) {
      console.error('Error removiendo persona del curso:', error);
      throw error;
    }
  }

  async assignInstructoresToCurso(cursoId: string, instructorIds: string[]): Promise<void> {
    try {
      const cursoDoc = doc(this.firestore, `cursos/${cursoId}`);
      await updateDoc(cursoDoc, { instructorIds: Array.from(new Set(instructorIds)) });
    } catch (error) {
      console.error('Error asignando instructores al curso:', error);
      throw error;
    }
  }

  async addInstructorToCurso(cursoId: string, instructorId: string): Promise<void> {
    try {
      const cursoDoc = doc(this.firestore, `cursos/${cursoId}`);
      const curso = await this.getCursoById(cursoId);

      if (curso) {
        const instructorIds = Array.from(new Set([...(curso.instructorIds || []), instructorId]));
        await updateDoc(cursoDoc, { instructorIds });
      }
    } catch (error) {
      console.error('Error agregando instructor al curso:', error);
      throw error;
    }
  }

  async removeInstructorFromCurso(cursoId: string, instructorId: string): Promise<void> {
    try {
      const cursoDoc = doc(this.firestore, `cursos/${cursoId}`);
      const curso = await this.getCursoById(cursoId);

      if (curso && curso.instructorIds) {
        const instructorIds = curso.instructorIds.filter(id => id !== instructorId);
        await updateDoc(cursoDoc, { instructorIds });
      }
    } catch (error) {
      console.error('Error removiendo instructor del curso:', error);
      throw error;
    }
  }
}
