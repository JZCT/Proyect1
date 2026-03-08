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
import { Auth, signInWithEmailAndPassword, signOut, user } from '@angular/fire/auth';
import { from, map, Observable, of, switchMap } from 'rxjs';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword as createUserWithEmailAndPasswordSecondary,
  getAuth as getSecondaryAuth
} from 'firebase/auth';
import { User } from '../models/user.model';
import { environment } from '../../environment/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private usersCollection;
  currentUser$: Observable<any>;
  currentUserData$: Observable<User | null>;

  constructor(
    private firestore: Firestore,
    private auth: Auth
  ) {
    this.usersCollection = collection(this.firestore, 'users');
    this.currentUser$ = user(this.auth);
    this.currentUserData$ = this.currentUser$.pipe(
      switchMap((firebaseUser) => {
        if (!firebaseUser) return of(null);
        return this.getUserDataByUid$(firebaseUser.uid);
      })
    );
  }

  getAllUsers(): Observable<User[]> {
    return collectionData(this.usersCollection, { idField: 'id' }) as Observable<User[]>;
  }

  getCompanyTags(): Observable<string[]> {
    return this.getAllUsers().pipe(
      map((users) => {
        const tags = users
          .filter((u) => u.role === 'company')
          .map((u) => this.normalizeCompanyTag(u.companyTag || ''))
          .filter((tag) => !!tag);

        return Array.from(new Set(tags)).sort((a, b) => a.localeCompare(b));
      })
    );
  }

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

  async addUser(userData: User): Promise<void> {
    let secondaryApp: ReturnType<typeof initializeApp> | null = null;

    try {
      secondaryApp = initializeApp(
        environment.firebaseConfig,
        `secondary-user-create-${Date.now()}`
      );

      const secondaryAuth = getSecondaryAuth(secondaryApp);
      const userCredential = await createUserWithEmailAndPasswordSecondary(
        secondaryAuth,
        userData.email,
        userData.password
      );

      const newUser = {
        nombre: userData.nombre,
        email: userData.email,
        role: userData.role || 'company',
        companyTag: userData.role === 'company' ? this.resolveCompanyTag(userData) : '',
        instructorId: userData.role === 'instructor' ? (userData.instructorId || '').trim() : '',
        uid: userCredential.user.uid,
        createdAt: new Date(),
        assignedCourseIds: userData.assignedCourseIds || []
      };

      await addDoc(this.usersCollection, newUser);
      console.log('Usuario creado exitosamente:', newUser);
    } catch (error: any) {
      console.error('Error al agregar usuario:', error);

      if (error.code === 'auth/email-already-in-use') {
        throw new Error('El email ya esta registrado');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('La contrasena es muy debil');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('El email no es valido');
      }

      throw error;
    } finally {
      if (secondaryApp) {
        await deleteApp(secondaryApp);
      }
    }
  }

  async deleteUser(userId: string): Promise<void> {
    try {
      const userDoc = doc(this.firestore, `users/${userId}`);
      await deleteDoc(userDoc);
    } catch (error) {
      console.error('Error al eliminar usuario:', error);
      throw error;
    }
  }

  login(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  logout() {
    return signOut(this.auth);
  }

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

  private getUserDataByUid$(uid: string): Observable<User | null> {
    return from(this.getUserData(uid));
  }

  private resolveCompanyTag(userData: User): string {
    const explicitTag = this.normalizeCompanyTag(userData.companyTag || '');
    if (explicitTag) return explicitTag;

    const byName = this.normalizeCompanyTag(userData.nombre || '');
    if (byName) return byName;

    const byEmail = this.normalizeCompanyTag((userData.email || '').split('@')[0] || '');
    return byEmail;
  }

  private normalizeCompanyTag(value: string): string {
    return (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .trim();
  }
}
