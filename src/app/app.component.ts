import { Component, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { AuthService } from './services/auth.service';
import { filter } from 'rxjs';
import { NotificationService } from './services/notification.service';
import { NotificationCenterComponent } from './components/notification-center/notification-center.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule, NotificationCenterComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'CecaptaINS - Sistema de Gestion';
  currentUser$ = this.authService.currentUserData$;
  @HostBinding('class.login-page') isLoginPage: boolean = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private notificationService: NotificationService
  ) {
    window.alert = (message?: unknown) => {
      this.notificationService.notifyFromAlert(message);
    };

    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.isLoginPage = this.router.url === '/login';
      });
  }

  async logout() {
    if (!confirm('Estas seguro de cerrar sesion?')) return;

    try {
      await this.authService.logout();
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error al cerrar sesion:', error);
      this.notificationService.error('No se pudo cerrar sesion. Intenta de nuevo.');
    }
  }
}
