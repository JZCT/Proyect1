import { Component, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { AuthService } from './services/auth.service';
import { filter } from 'rxjs';
import { NotificationService } from './services/notification.service';
import { NotificationCenterComponent } from './components/notification-center/notification-center.component';
import './utils/asset-url.util';

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
  mobileNavOpen = false;
  @HostBinding('class.login-page') isLoginPage: boolean = false;
  @HostBinding('class.embed-mode') isEmbedMode: boolean = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private notificationService: NotificationService
  ) {
    this.isEmbedMode = this.detectEmbedMode();
    window.alert = (message?: unknown) => {
      this.notificationService.notifyFromAlert(message);
    };

    this.updateRouteState(this.router.url);
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.updateRouteState((event as NavigationEnd).urlAfterRedirects);
        this.closeMobileNav();
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

  toggleMobileNav() {
    this.mobileNavOpen = !this.mobileNavOpen;
  }

  closeMobileNav() {
    this.mobileNavOpen = false;
  }

  private updateRouteState(url: string) {
    this.isLoginPage = url === '/login';
  }

  private detectEmbedMode(): boolean {
    const globalMode = typeof window !== 'undefined'
      ? String(window.CECAPTA_EMBED_MODE || '').trim().toLowerCase()
      : '';

    if (globalMode === 'wordpress') {
      return true;
    }

    if (typeof window === 'undefined') {
      return false;
    }

    return new URLSearchParams(window.location.search).get('embed') === 'wordpress';
  }
}
