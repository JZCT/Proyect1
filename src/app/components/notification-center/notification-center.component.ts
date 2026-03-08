import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-notification-center',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-center.component.html',
  styleUrl: './notification-center.component.scss'
})
export class NotificationCenterComponent {
  notifications$ = this.notificationService.notifications$;

  constructor(private notificationService: NotificationService) {}

  dismiss(id: number) {
    this.notificationService.dismiss(id);
  }
}
