import { ApplicationConfig } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { getApp } from 'firebase/app';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import {
  enablePersistentCacheIndexAutoCreation,
  getFirestore,
  getPersistentCacheIndexManager,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  provideFirestore
} from '@angular/fire/firestore';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getStorage, provideStorage } from '@angular/fire/storage';
import { environment } from '../environment/environment';
import { routes } from './app.routes';

function provideOptimizedFirestoreInstance() {
  try {
    const firestore = initializeFirestore(getApp(), {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });

    const indexManager = getPersistentCacheIndexManager(firestore);
    if (indexManager) {
      enablePersistentCacheIndexAutoCreation(indexManager);
    }

    return firestore;
  } catch (error) {
    console.warn('No se pudo activar cache persistente de Firestore. Se usara cache en memoria.', error);

    try {
      return initializeFirestore(getApp(), {
        localCache: memoryLocalCache()
      });
    } catch {
      return getFirestore();
    }
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withHashLocation()),
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideAuth(() => getAuth()),
    provideFirestore(() => provideOptimizedFirestoreInstance()),
    provideStorage(() => getStorage())
  ]
};
