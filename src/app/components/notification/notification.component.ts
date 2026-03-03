// src/app/components/notification/notification.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { NotificationService, Notification } from '../../services/notification.service';

@Component({
  selector: 'app-notification',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="notification" class="notification-container" [class]="notification.type">
      <div class="notification-content">
        <span class="message">{{ notification.message }}</span>
        <button class="close-btn" (click)="close()">✕</button>
      </div>
      <div class="progress-bar" *ngIf="notification.duration && notification.duration > 0">
        <div class="progress-fill" [style.animation-duration]="notification.duration + 'ms'"></div>
      </div>
    </div>
  `,
  styles: [`
    .notification-container {
      position: fixed;
      top: 20px;
      right: 20px;
      min-width: 300px;
      max-width: 450px;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 9999;
      animation: slideIn 0.3s ease;
      overflow: hidden;
    }

    .success {
      background: linear-gradient(135deg, #10b981, #059669);
      color: white;
    }

    .error {
      background: linear-gradient(135deg, #ef4444, #dc2626);
      color: white;
    }

    .info {
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      color: white;
    }

    .warning {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: white;
    }

    .notification-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }

    .message {
      flex: 1;
      font-size: 14px;
      font-weight: 500;
    }

    .close-btn {
      background: transparent;
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
      padding: 0 4px;
      opacity: 0.8;
      transition: opacity 0.2s;
    }

    .close-btn:hover {
      opacity: 1;
    }

    .progress-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 3px;
      background: rgba(255,255,255,0.3);
    }

    .progress-fill {
      height: 100%;
      background: rgba(255,255,255,0.8);
      animation: progress linear forwards;
    }

    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes progress {
      from { width: 100%; }
      to { width: 0%; }
    }
  `]
})
export class NotificationComponent implements OnInit, OnDestroy {
  notification: Notification | null = null;
  private subscription: Subscription;
  private timeout: any;

  constructor(private notificationService: NotificationService) {
    this.subscription = this.notificationService.notifications$.subscribe(
      notification => {
        if (this.timeout) {
          clearTimeout(this.timeout);
        }
        
        this.notification = notification;
        
        if (notification && notification.duration) {
          this.timeout = setTimeout(() => {
            this.close();
          }, notification.duration);
        }
      }
    );
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
  }

  close(): void {
    this.notification = null;
    this.notificationService.clear();
  }
}