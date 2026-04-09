import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc, collectionData, doc, deleteDoc } from '@angular/fire/firestore';
import { Observable, shareReplay } from 'rxjs';
import { User } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class UserAdminService {
  private users$: Observable<User[]> | null = null;

  constructor(private firestore: Firestore) {}

  getUsers(): Observable<User[]> {
    if (!this.users$) {
      const userRef = collection(this.firestore, 'usuarios');
      this.users$ = (collectionData(userRef, { idField: 'id' }) as Observable<User[]>).pipe(
        shareReplay({ bufferSize: 1, refCount: true })
      );
    }

    return this.users$;
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
