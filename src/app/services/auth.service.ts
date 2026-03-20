import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  deleteDoc,
  getDoc,
  updateDoc,
  query,
  setDoc,
  where,
  getDocs
} from '@angular/fire/firestore';
import {
  Auth,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  user
} from '@angular/fire/auth';
import { from, map, Observable, of, shareReplay, switchMap } from 'rxjs';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword as createUserWithEmailAndPasswordSecondary,
  deleteUser as deleteSecondaryAuthUser,
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
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  getAllUsers(): Observable<User[]> {
    return collectionData(this.usersCollection, { idField: 'id' }) as Observable<User[]>;
  }

  getCompanyTags(): Observable<string[]> {
    return this.currentUserData$.pipe(
      switchMap((currentUser) => {
        if (!currentUser) {
          return of([]);
        }

        if (currentUser.role !== 'admin') {
          const tag = this.normalizeCompanyTag(currentUser.companyTag || '');
          return of(tag ? [tag] : []);
        }

        const companyUsersQuery = query(this.usersCollection, where('role', '==', 'company'));
        return collectionData(companyUsersQuery, { idField: 'id' }).pipe(
          map((users) => {
            const tags = users
              .map((u) => this.normalizeCompanyTag((u as User).companyTag || ''))
              .filter((tag) => !!tag);

            return Array.from(new Set(tags)).sort((a, b) => a.localeCompare(b));
          })
        );
      })
    );
  }

  isAdmin(): Observable<boolean> {
    return this.currentUserData$.pipe(map((userData) => userData?.role === 'admin'));
  }

  async addUser(userData: User): Promise<void> {
    let secondaryApp: ReturnType<typeof initializeApp> | null = null;
    let createdSecondaryUser: Awaited<ReturnType<typeof createUserWithEmailAndPasswordSecondary>>['user'] | null = null;

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
      createdSecondaryUser = userCredential.user;

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

      const userDoc = doc(this.firestore, `users/${userCredential.user.uid}`);
      await setDoc(userDoc, newUser);
      console.log('Usuario creado exitosamente:', newUser);
    } catch (error: any) {
      console.error('Error al agregar usuario:', error);

      if (createdSecondaryUser) {
        try {
          await deleteSecondaryAuthUser(createdSecondaryUser);
        } catch (rollbackError) {
          console.error('No se pudo revertir el usuario de Auth creado temporalmente:', rollbackError);
        }
      }

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

  async updateUserCompanyTag(
    userId: string,
    userData: Pick<User, 'nombre' | 'email' | 'role'> & { companyTag?: string }
  ): Promise<void> {
    try {
      const userDoc = doc(this.firestore, `users/${userId}`);
      const companyTag = userData.role === 'company'
        ? this.resolveCompanyTag(userData)
        : '';

      await updateDoc(userDoc, { companyTag });
    } catch (error) {
      console.error('Error actualizando etiqueta de empresa:', error);
      throw error;
    }
  }

  login(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  resetPassword(email: string) {
    return sendPasswordResetEmail(this.auth, email.trim());
  }

  logout() {
    return signOut(this.auth);
  }

  waitForCurrentUserData(uid: string, timeoutMs = 3000): Promise<User | null> {
    const normalizedUid = (uid || '').trim();
    if (!normalizedUid) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      let subscription: { unsubscribe: () => void } | null = null;
      const timeoutId = window.setTimeout(() => {
        subscription?.unsubscribe();
        resolve(null);
      }, timeoutMs);

      subscription = this.currentUserData$.subscribe((userData) => {
        if (userData?.id === normalizedUid) {
          window.clearTimeout(timeoutId);
          subscription?.unsubscribe();
          resolve(userData);
        }
      });
    });
  }

  async getUserData(uid: string): Promise<User | null> {
    try {
      const userDoc = doc(this.firestore, `users/${uid}`);
      const directSnapshot = await getDoc(userDoc);

      if (directSnapshot.exists()) {
        const userData = directSnapshot.data() as User;
        return {
          ...userData,
          id: directSnapshot.id
        };
      }

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

  private resolveCompanyTag(userData: Pick<User, 'nombre' | 'email'> & { companyTag?: string }): string {
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
