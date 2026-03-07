import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc, collectionData, doc, updateDoc, deleteDoc } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Observable } from 'rxjs';
import { Persona } from '../models/persona.model';

@Injectable({
  providedIn: 'root'
})
export class PersonaService {
  constructor(private firestore: Firestore, private storage: Storage) {}

  getPersonas(): Observable<Persona[]> {
    const personaRef = collection(this.firestore, 'personas');
    return collectionData(personaRef, { idField: 'id' }) as Observable<Persona[]>;
  }

  // Sube un archivo (foto o doc) y devuelve la URL de descarga
  async uploadFile(file: File): Promise<string> {
    const filePath = `uploads/${Date.now()}_${file.name}`;
    const fileRef = ref(this.storage, filePath);
    await uploadBytes(fileRef, file);
    return getDownloadURL(fileRef);
  }

  addPersona(persona: Persona) {
    const personaRef = collection(this.firestore, 'personas');
    return addDoc(personaRef, persona);
  }

  updatePersona(id: string, persona: Persona) {
    const docRef = doc(this.firestore, `personas/${id}`);
    return updateDoc(docRef, { ...persona });
  }

  deletePersona(id: string) {
    const docRef = doc(this.firestore, `personas/${id}`);
    return deleteDoc(docRef);
  }
}