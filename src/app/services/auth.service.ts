import { Injectable } from '@angular/core';
import { 
  Firestore, 
  collection, 
  addDoc, 
  collectionData, 
  doc, 
  deleteDoc,
  query,
  where,
  getDocs 
} from '@angular/fire/firestore';
import { Auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, user } from '@angular/fire/auth';
import { Observable, from, map, switchMap } from 'rxjs';
import { User } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private usersCollection;
  currentUser$: Observable<any>;

  constructor(
    private firestore: Firestore,
    private auth: Auth
  ) {
    this.usersCollection = collection(this.firestore, 'users');
    this.currentUser$ = user(this.auth);
  }

  // Obtener todos los usuarios como Observable
  getAllUsers(): Observable<User[]> {
    return collectionData(this.usersCollection, { idField: 'id' }) as Observable<User[]>;
  }

  // Verificar si es admin
  isAdmin(): Observable<boolean> {
    return this.currentUser$.pipe(
      switchMap(async (firebaseUser) => {
        if (!firebaseUser) return false;
        
        const usersRef = collection(this.firestore, 'users');
        const q = query(usersRef, where('uid', '==', firebaseUser.uid));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const userData = querySnapshot.docs[0].data() as User;
          return userData.role === 'admin';
        }
        return false;
      })
    );
  }

  // Agregar usuario
  async addUser(user: User): Promise<void> {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        this.auth, 
        user.email, 
        this.generateTemporaryPassword()
      );
      
      const newUser = {
        nombre: user.nombre,
        email: user.email,
        role: user.role || 'company',
        uid: userCredential.user.uid,
        createdAt: new Date()
      };
      
      await addDoc(this.usersCollection, newUser);
    } catch (error) {
      console.error('Error al agregar usuario:', error);
      throw error;
    }
  }

  // Eliminar usuario
  async deleteUser(userId: string): Promise<void> {
    try {
      const userDoc = doc(this.firestore, `users/${userId}`);
      await deleteDoc(userDoc);
    } catch (error) {
      console.error('Error al eliminar usuario:', error);
      throw error;
    }
  }

  // Login
  login(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  // Logout
  logout() {
    return signOut(this.auth);
  }

  private generateTemporaryPassword(): string {
    return Math.random().toString(36).slice(-8) + 'A1!';
  }
  // Añade este método al AuthService
async getUserData(uid: string): Promise<User | null> {
  try {
    const usersRef = collection(this.firestore, 'users');
    const q = query(usersRef, where('uid', '==', uid));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const userData = querySnapshot.docs[0].data() as User;
      return {
        ...userData,
        id: querySnapshot.docs[0].id
      };
    }
    return null;
  } catch (error) {
    console.error('Error obteniendo datos del usuario:', error);
    return null;
  }
}
}