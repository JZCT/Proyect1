import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ViewStateService {
  private readonly storagePrefix = 'cecapta.view-state.';

  getState<T>(key: string, fallback: T): T {
    const storage = this.getStorage();
    if (!storage) return fallback;

    try {
      const raw = storage.getItem(this.resolveStorageKey(key));
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  setState<T>(key: string, value: T): void {
    const storage = this.getStorage();
    if (!storage) return;

    try {
      storage.setItem(this.resolveStorageKey(key), JSON.stringify(value));
    } catch {
      // Ignore storage errors (quota, private mode, etc.)
    }
  }

  private resolveStorageKey(key: string): string {
    return `${this.storagePrefix}${(key || '').trim()}`;
  }

  private getStorage(): Storage | null {
    if (typeof window === 'undefined') return null;

    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }
}
