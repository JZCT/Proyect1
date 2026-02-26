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

  // Obtener todos los cursos
  getCursos(): Observable<Curso[]> {
    return collectionData(this.cursosCollection, { idField: 'id' }) as Observable<Curso[]>;
  }

  // Agregar curso
  async addCurso(curso: Curso): Promise<void> {
    try {
      const newCurso = {
        ...curso,
        personasIds: curso.personasIds || [],
        createdAt: new Date()
      };
      await addDoc(this.cursosCollection, newCurso);
    } catch (error) {
      console.error('Error agregando curso:', error);
      throw error;
    }
  }

  // Actualizar curso
  async updateCurso(id: string, curso: Partial<Curso>): Promise<void> {
    try {
      const cursoDoc = doc(this.firestore, `cursos/${id}`);
      await updateDoc(cursoDoc, { ...curso });
    } catch (error) {
      console.error('Error actualizando curso:', error);
      throw error;
    }
  }

  // Eliminar curso
  async deleteCurso(id: string): Promise<void> {
    try {
      const cursoDoc = doc(this.firestore, `cursos/${id}`);
      await deleteDoc(cursoDoc);
    } catch (error) {
      console.error('Error eliminando curso:', error);
      throw error;
    }
  }

  // Obtener curso por ID
  async getCursoById(id: string): Promise<Curso | null> {
    try {
      const q = query(this.cursosCollection, where('__name__', '==', id));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        return querySnapshot.docs[0].data() as Curso;
      }
      return null;
    } catch (error) {
      console.error('Error obteniendo curso:', error);
      return null;
    }
  }

  // Agregar persona a curso
  async addPersonaToCurso(cursoId: string, personaId: string): Promise<void> {
    try {
      const cursoDoc = doc(this.firestore, `cursos/${cursoId}`);
      const curso = await this.getCursoById(cursoId);
      
      if (curso) {
        const personasIds = [...(curso.personasIds || []), personaId];
        await updateDoc(cursoDoc, { personasIds });
      }
    } catch (error) {
      console.error('Error agregando persona al curso:', error);
      throw error;
    }
  }

  // Remover persona de curso
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
}