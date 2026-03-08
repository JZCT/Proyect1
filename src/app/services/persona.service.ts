import { Injectable } from '@angular/core';
import { 
  Firestore, 
  collection, 
  addDoc, 
  collectionData, 
  doc, 
  deleteDoc, 
  updateDoc,
  writeBatch,
  query,
  where,
  getDocs
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Persona } from '../models/persona.model';

@Injectable({
  providedIn: 'root'
})
export class PersonaService {
  private personasCollection;

  constructor(private firestore: Firestore) {
    this.personasCollection = collection(this.firestore, 'personas');
  }

  // Obtener todas las personas
  getPersonas(): Observable<Persona[]> {
    return collectionData(this.personasCollection, { idField: 'id' }) as Observable<Persona[]>;
  }

  // Agregar persona
  async addPersona(persona: Persona): Promise<void> {
    try {
      const newPersona = {
        ...persona,
        createdAt: new Date(),
        cursoIds: persona.cursoIds || []
      };
      await addDoc(this.personasCollection, newPersona);
    } catch (error) {
      console.error('Error agregando persona:', error);
      throw error;
    }
  }

  // Actualizar persona
  async updatePersona(id: string, persona: Partial<Persona>): Promise<void> {
    try {
      const personaDoc = doc(this.firestore, `personas/${id}`);
      await updateDoc(personaDoc, { ...persona });
    } catch (error) {
      console.error('Error actualizando persona:', error);
      throw error;
    }
  }

  // Eliminar persona
  async deletePersona(id: string): Promise<void> {
    try {
      const personaDoc = doc(this.firestore, `personas/${id}`);
      await deleteDoc(personaDoc);
    } catch (error) {
      console.error('Error eliminando persona:', error);
      throw error;
    }
  }

  // Eliminar personas en lote (operacion rapida para seleccion multiple)
  async deletePersonas(ids: string[]): Promise<void> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return;
    }

    try {
      const chunkSize = 450; // Firestore permite hasta 500 operaciones por batch

      for (let i = 0; i < uniqueIds.length; i += chunkSize) {
        const chunk = uniqueIds.slice(i, i + chunkSize);
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

  // Obtener persona por email
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

  // Asignar persona a curso
  async assignToCurso(personaId: string, cursoId: string): Promise<void> {
    try {
      const personaDoc = doc(this.firestore, `personas/${personaId}`);
      const persona = await this.getPersonaById(personaId);
      
      if (persona) {
        const cursoIds = [...(persona.cursoIds || []), cursoId];
        await updateDoc(personaDoc, { cursoIds });
      }
    } catch (error) {
      console.error('Error asignando persona a curso:', error);
      throw error;
    }
  }

  // Remover persona de curso
  async removeFromCurso(personaId: string, cursoId: string): Promise<void> {
    try {
      const personaDoc = doc(this.firestore, `personas/${personaId}`);
      const persona = await this.getPersonaById(personaId);
      
      if (persona && persona.cursoIds) {
        const cursoIds = persona.cursoIds.filter(id => id !== cursoId);
        await updateDoc(personaDoc, { cursoIds });
      }
    } catch (error) {
      console.error('Error removiendo persona de curso:', error);
      throw error;
    }
  }

  // Obtener persona por ID
  private async getPersonaById(id: string): Promise<Persona | null> {
    try {
      const personaDoc = doc(this.firestore, `personas/${id}`);
      const querySnapshot = await getDocs(query(this.personasCollection, where('__name__', '==', id)));
      
      if (!querySnapshot.empty) {
        return querySnapshot.docs[0].data() as Persona;
      }
      return null;
    } catch (error) {
      console.error('Error obteniendo persona:', error);
      return null;
    }
  }
}
