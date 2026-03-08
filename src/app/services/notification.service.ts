import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface AppNotification {
  id: number;
  type: NotificationType;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly notificationsSubject = new BehaviorSubject<AppNotification[]>([]);
  readonly notifications$ = this.notificationsSubject.asObservable();
  private nextId = 1;

  success(message: string, timeoutMs = 3200) {
    this.show('success', message, timeoutMs);
  }

  error(message: string, timeoutMs = 4200) {
    this.show('error', message, timeoutMs);
  }

  warning(message: string, timeoutMs = 3600) {
    this.show('warning', message, timeoutMs);
  }

  info(message: string, timeoutMs = 3200) {
    this.show('info', message, timeoutMs);
  }

  dismiss(id: number) {
    const current = this.notificationsSubject.value;
    this.notificationsSubject.next(current.filter((notification) => notification.id !== id));
  }

  notifyFromAlert(message: unknown) {
    const text = String(message ?? '').trim();
    if (!text) return;

    const normalized = this.normalize(text);
    if (text.includes('✅') || normalized.includes('exitosamente')) {
      this.success(text);
      return;
    }

    if (
      text.includes('❌') ||
      normalized.includes('error') ||
      normalized.includes('no se pudo')
    ) {
      this.error(text);
      return;
    }

    if (
      normalized.includes('permiso') ||
      normalized.includes('requerid') ||
      normalized.includes('debes') ||
      normalized.includes('selecciona') ||
      normalized.includes('invalido') ||
      normalized.includes('invalida')
    ) {
      this.warning(text);
      return;
    }

    this.info(text);
  }

  private show(type: NotificationType, message: string, timeoutMs: number) {
    const notification: AppNotification = {
      id: this.nextId++,
      type,
      message
    };

    const current = this.notificationsSubject.value;
    this.notificationsSubject.next([...current, notification]);

    setTimeout(() => {
      this.dismiss(notification.id);
    }, timeoutMs);
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
