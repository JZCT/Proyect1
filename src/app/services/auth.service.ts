// src/app/services/auth.service.ts (fragmento actualizado)
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
  getDocs,
  updateDoc
} from '@angular/fire/firestore';
import { Auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, user } from '@angular/fire/auth';
import { Observable, switchMap } from 'rxjs';
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

  // ✅ Generar contraseña aleatoria
  private generatePassword(): string {
    const length = 10;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      password += charset[randomIndex];
    }
    return password;
  }

  // ✅ Agregar usuario (ahora guarda contraseña)
  async addUser(user: User): Promise<{ success: boolean; password?: string; error?: any }> {
    try {
      // Generar contraseña
      const password = this.generatePassword();
      
      // Crear en Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        this.auth, 
        user.email, 
        password
      );
      
      const newUser = {
        nombre: user.nombre,
        email: user.email,
        role: user.role || 'company',
        uid: userCredential.user.uid,
        assignedCourseIds: [],
        tempPassword: password,           // 👈 Guardar contraseña temporal
        isTestUser: true,                 // 👈 Marcar como usuario de prueba
        createdAt: new Date(),
        lastPasswordReset: new Date()
      };
      
      await addDoc(this.usersCollection, newUser);
      
      return { 
        success: true, 
        password: password  // 👈 Devolver contraseña para mostrarla
      };
    } catch (error) {
      console.error('Error al agregar usuario:', error);
      return { success: false, error };
    }
  }

  // ✅ Regenerar contraseña
  async regeneratePassword(userId: string): Promise<{ success: boolean; newPassword?: string; error?: any }> {
    try {
      // Obtener usuario
      const userRef = doc(this.firestore, `users/${userId}`);
      const userSnap = await getDocs(query(collection(this.firestore, 'users'), where('__name__', '==', userId)));
      
      if (userSnap.empty) {
        return { success: false, error: 'Usuario no encontrado' };
      }
      
      const userData = userSnap.docs[0].data() as User;
      const userEmail = userData.email;
      
      // Generar nueva contraseña
      const newPassword = this.generatePassword();
      
      // Actualizar en Firebase Auth (requiere reautenticación - más complejo)
      // Por ahora solo actualizamos en Firestore
      await updateDoc(doc(this.firestore, `users/${userId}`), {
        tempPassword: newPassword,
        lastPasswordReset: new Date()
      });
      
      return { 
        success: true, 
        newPassword 
      };
    } catch (error) {
      console.error('Error regenerando contraseña:', error);
      return { success: false, error };
    }
  }

  // ✅ Eliminar usuario
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

  // Obtener todos los usuarios
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

  // Obtener datos del usuario por UID
  async getUserData(uid: string): Promise<User | null> {
    try {
      const usersRef = collection(this.firestore, 'users');
      const q = query(usersRef, where('uid', '==', uid));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data() as User;
        return {
          ...userData,
          id: querySnapshot.docs[0].id,
          uid: userData.uid
        };
      }
      return null;
    } catch (error) {
      console.error('Error obteniendo datos del usuario:', error);
      return null;
    }
  }

  // Crear usuario instructor
  async createInstructorUser(userData: Partial<User>): Promise<void> {
    try {
      const usersRef = collection(this.firestore, 'users');
      const q = query(usersRef, where('uid', '==', userData.uid));
      const existing = await getDocs(q);
      
      if (existing.empty) {
        await addDoc(this.usersCollection, {
          nombre: userData.nombre,
          email: userData.email,
          role: 'instructor',
          uid: userData.uid,
          assignedCourseIds: userData.assignedCourseIds || [],
          isTestUser: true,
          tempPassword: 'INSTRUCTOR_' + this.generatePassword(),
          createdAt: new Date()
        });
      }
    } catch (error) {
      console.error('Error creando usuario instructor:', error);
      throw error;
    }
  }

  // Actualizar cursos del instructor
  async updateInstructorCourses(instructorUid: string, courseIds: string[]): Promise<void> {
    try {
      const usersRef = collection(this.firestore, 'users');
      const q = query(usersRef, where('uid', '==', instructorUid));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0];
        const userRef = doc(this.firestore, `users/${userDoc.id}`);
        await updateDoc(userRef, { assignedCourseIds: courseIds });
      }
    } catch (error) {
      console.error('Error actualizando cursos del instructor:', error);
      throw error;
    }
  }
}