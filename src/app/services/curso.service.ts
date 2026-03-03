import { Injectable } from '@angular/core';
import { 
  Firestore, 
  collection, 
  addDoc, 
  collectionData, 
  doc, 
  deleteDoc, 
  updateDoc,
  getDoc
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
        nombre: curso.nombre,
        descripcion: curso.descripcion,
        fechaInicio: curso.fechaInicio,           // ✅ Nombre actualizado
        fechaFin: curso.fechaFin,                  // ✅ Nombre actualizado
        nomRepresentante: curso.nomRepresentante,  // ✅ Nombre actualizado
        numRepresentantes: curso.numRepresentantes, // ✅ Nombre actualizado
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

  // Actualizar curso
  async updateCurso(id: string, curso: Partial<Curso>): Promise<void> {
    try {
      const cursoDoc = doc(this.firestore, `cursos/${id}`);
      
      // Mapear los campos si es necesario
      const updateData: any = { ...curso };
      
      await updateDoc(cursoDoc, updateData);
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
      const cursoDoc = doc(this.firestore, `cursos/${id}`);
      const snap = await getDoc(cursoDoc);

      if (!snap.exists()) return null;

      return { id: snap.id, ...snap.data() } as Curso;

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

  // Agregar instructor a curso
  async addInstructorToCurso(cursoId: string, instructorId: string): Promise<void> {
    try {
      const cursoDoc = doc(this.firestore, `cursos/${cursoId}`);
      const curso = await this.getCursoById(cursoId);

      if (curso) {
        const instructorIds = [...(curso.instructorIds || []), instructorId];
        await updateDoc(cursoDoc, { instructorIds });
      }

    } catch (error) {
      console.error('Error agregando instructor al curso:', error);
      throw error;
    }
  }

  // Remover instructor de curso
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