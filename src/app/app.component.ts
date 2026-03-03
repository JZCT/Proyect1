import { Component, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { AuthService } from './services/auth.service';
import { filter } from 'rxjs';
import { NotificationComponent } from './components/notification/notification.component';
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule, NotificationComponent, ThemeToggleComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'CecaptaINS - Sistema de Gestión';
  currentUser$ = this.authService.currentUser$;
  @HostBinding('class.login-page') isLoginPage: boolean = false;

  constructor(private authService: AuthService, private router: Router) {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.isLoginPage = this.router.url === '/login';
      });
  }

  logout() {
    if (confirm('¿Estás seguro de cerrar sesión?')) {
      this.router.navigate(['/login']);
    } else {
      this.router.navigate(['/home']);
    }
  }
}
