import { Injectable, inject } from '@angular/core';
import { 
  Firestore, 
  collection, 
  collectionData, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc,
  query,
  where,
  getDocs,
  DocumentReference
} from '@angular/fire/firestore';
import { Observable, from, map } from 'rxjs';
import { Instructor } from '../models/instructor.model';
import { CursoService } from './curso.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class InstructorService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private cursosCollection = collection(this.firestore, 'cursos');
  private instructoresCollection = collection(this.firestore, 'instructores');

  constructor(private cursoService: CursoService) {}

  // ✅ Obtener instructores con Observable
  getInstructores(): Observable<Instructor[]> {
    return collectionData(this.instructoresCollection, { idField: 'id' }) as Observable<Instructor[]>;
  }

  // ✅ Agregar instructor con manejo de errores mejorado
  async addInstructor(instructor: Instructor): Promise<void> {
    try {
      const id = doc(this.instructoresCollection).id; // Generar ID
      const instructorRef = doc(this.firestore, `instructores/${id}`);
      
      // 1. Crear en colección instructores
      await setDoc(instructorRef, {
        ...instructor,
        id,
        uid: id,
        cursoIds: instructor.cursoIds || [],
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // 2. Crear en colección users
      await this.authService.createInstructorUser({
        nombre: instructor.nombre,
        email: instructor.email || '',
        role: 'instructor',
        uid: id,
        assignedCourseIds: []
      });

      console.log('✅ Instructor creado exitosamente');
    } catch (error) {
      console.error('❌ Error agregando instructor:', error);
      throw new Error('No se pudo crear el instructor. Intenta nuevamente.');
    }
  }

  // ✅ Actualizar instructor
  async updateInstructor(id: string, instructor: Partial<Instructor>): Promise<void> {
    try {
      const instructorRef = doc(this.firestore, `instructores/${id}`);
      await updateDoc(instructorRef, {
        ...instructor,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('❌ Error actualizando instructor:', error);
      throw new Error('No se pudo actualizar el instructor.');
    }
  }

  // ✅ Eliminar instructor
  async deleteInstructor(id: string): Promise<void> {
    try {
      // 1. Eliminar de colección instructores
      const instructorRef = doc(this.firestore, `instructores/${id}`);
      await deleteDoc(instructorRef);
      
      // 2. Buscar y eliminar de colección users
      const usersRef = collection(this.firestore, 'users');
      const q = query(usersRef, where('uid', '==', id));
      const querySnapshot = await getDocs(q);
      
      querySnapshot.forEach(async (doc) => {
        await deleteDoc(doc.ref);
      });

      console.log('✅ Instructor eliminado exitosamente');
    } catch (error) {
      console.error('❌ Error eliminando instructor:', error);
      throw new Error('No se pudo eliminar el instructor.');
    }
  }

  // ✅ Verificar si puede asignar más cursos
  async canAssignMoreCourses(instructorId: string): Promise<boolean> {
    try {
      const instructorRef = doc(this.firestore, `instructores/${instructorId}`);
      const instructorSnap = await getDoc(instructorRef);
      
      if (!instructorSnap.exists()) return false;
      
      const instructor = instructorSnap.data() as Instructor;
      const cursosActuales = instructor.cursoIds?.length || 0;
      
      return cursosActuales < 3;
      
    } catch (error) {
      console.error('❌ Error verificando disponibilidad:', error);
      return false;
    }
  }

  // ✅ Asignar instructor a curso
  async assignInstructorToCurso(instructorId: string, cursoId: string): Promise<{ success: boolean; message: string }> {
    try {
      const instructorRef = doc(this.firestore, `instructores/${instructorId}`);
      const instructorSnap = await getDoc(instructorRef);

      if (!instructorSnap.exists()) {
        return { success: false, message: 'Instructor no encontrado' };
      }

      const instructor = instructorSnap.data() as Instructor;
      const cursosActuales = instructor.cursoIds || [];
      
      if (cursosActuales.length >= 3) {
        return { success: false, message: 'El instructor ya tiene 3 cursos asignados (límite máximo)' };
      }

      if (cursosActuales.includes(cursoId)) {
        return { success: false, message: 'El instructor ya está asignado a este curso' };
      }

      // Actualizar instructor
      await updateDoc(instructorRef, {
        cursoIds: [...cursosActuales, cursoId],
        updatedAt: new Date()
      });

      // Actualizar curso
      await this.cursoService.addInstructorToCurso(cursoId, instructorId);

      // Actualizar usuario
      await this.authService.updateInstructorCourses(instructorId, [...cursosActuales, cursoId]);

      return { success: true, message: '✅ Instructor asignado exitosamente' };
    } catch (error) {
      console.error('❌ Error asignando instructor a curso:', error);
      return { success: false, message: 'Error al asignar instructor' };
    }
  }

  // ✅ Remover instructor de curso
  async removeInstructorFromCurso(instructorId: string, cursoId: string): Promise<void> {
    try {
      const instructorRef = doc(this.firestore, `instructores/${instructorId}`);
      const instructorSnap = await getDoc(instructorRef);

      if (!instructorSnap.exists()) {
        throw new Error('Instructor no encontrado');
      }

      const instructor = instructorSnap.data() as Instructor;
      const nuevosCursos = (instructor.cursoIds || []).filter(id => id !== cursoId);
      
      // Actualizar instructor
      await updateDoc(instructorRef, {
        cursoIds: nuevosCursos,
        updatedAt: new Date()
      });

      // Actualizar curso
      await this.cursoService.removeInstructorFromCurso(cursoId, instructorId);

      // Actualizar usuario
      await this.authService.updateInstructorCourses(instructorId, nuevosCursos);
      
    } catch (error) {
      console.error('❌ Error removiendo instructor del curso:', error);
      throw new Error('No se pudo remover el instructor del curso.');
    }
  }

  // ✅ Obtener instructor por ID
  async getInstructorById(id: string): Promise<Instructor | null> {
    try {
      const instructorRef = doc(this.firestore, `instructores/${id}`);
      const instructorSnap = await getDoc(instructorRef);
      
      if (!instructorSnap.exists()) return null;
      
      return {
        id: instructorSnap.id,
        ...instructorSnap.data()
      } as Instructor;
    } catch (error) {
      console.error('❌ Error obteniendo instructor:', error);
      return null;
    }
  }
}