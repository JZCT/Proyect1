// src/app/services/notification.service.ts
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface Notification {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notificationSubject = new Subject<Notification | null>();
  notifications$ = this.notificationSubject.asObservable();

  showSuccess(message: string, duration: number = 3000): void {
    this.notificationSubject.next({ message, type: 'success', duration });
  }

  showError(message: string, duration: number = 5000): void {
    this.notificationSubject.next({ message, type: 'error', duration });
  }

  showInfo(message: string, duration: number = 3000): void {
    this.notificationSubject.next({ message, type: 'info', duration });
  }

  showWarning(message: string, duration: number = 4000): void {
    this.notificationSubject.next({ message, type: 'warning', duration });
  }

  clear(): void {
    this.notificationSubject.next(null);
  }
}