import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc, collectionData, doc, deleteDoc } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { User } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class UserAdminService {
  constructor(private firestore: Firestore) {}

  getUsers(): Observable<User[]> {
    const userRef = collection(this.firestore, 'usuarios');
    return collectionData(userRef, { idField: 'id' }) as Observable<User[]>;
  }

  addUser(user: User) {
    const userRef = collection(this.firestore, 'usuarios');
    return addDoc(userRef, { ...user, fechaRegistro: new Date() });
  }

  deleteUser(id: string) {
    const docRef = doc(this.firestore, `usuarios/${id}`);
    return deleteDoc(docRef);
  }
}