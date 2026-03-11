import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  loginForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required, Validators.minLength(6)])
  });

  loading = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private notificationService: NotificationService
  ) {}

  async login() {
    if (this.loginForm.invalid) {
      this.notificationService.warning('Por favor completa todos los campos correctamente');
      return;
    }

    this.loading = true;

    const email = this.loginForm.get('email')?.value || '';
    const password = this.loginForm.get('password')?.value || '';

    try {
      const credential = await this.authService.login(email, password);
      const userData = await this.authService.getUserData(credential.user.uid);
      const targetRoute = userData?.role === 'instructor' ? '/' : '/home';

      this.notificationService.success('Sesion iniciada correctamente');
      this.router.navigate([targetRoute]);
    } catch (error: any) {
      console.error('Error de login:', error);

      switch (error.code) {
        case 'auth/user-not-found':
          this.notificationService.error('Usuario no encontrado');
          break;
        case 'auth/wrong-password':
          this.notificationService.error('Contrasena incorrecta');
          break;
        case 'auth/invalid-email':
          this.notificationService.error('Email invalido');
          break;
        case 'auth/user-disabled':
          this.notificationService.error('Usuario deshabilitado');
          break;
        default:
          this.notificationService.error('Error al iniciar sesion. Intenta de nuevo.');
      }
    } finally {
      this.loading = false;
    }
  }

  async recoverPassword() {
    const emailControl = this.loginForm.get('email');
    emailControl?.markAsTouched();

    if (!emailControl?.value || emailControl.invalid) {
      this.notificationService.warning('Escribe un email valido para recuperar la contrasena');
      return;
    }

    this.loading = true;

    try {
      await this.authService.resetPassword(emailControl.value);
      this.notificationService.info(
        'Si el correo existe, recibiras un enlace para restablecer la contrasena.'
      );
    } catch (error: any) {
      console.error('Error enviando recuperacion de contrasena:', error);

      switch (error.code) {
        case 'auth/invalid-email':
          this.notificationService.error('Email invalido');
          break;
        case 'auth/too-many-requests':
          this.notificationService.warning('Demasiados intentos. Espera un momento e intenta de nuevo.');
          break;
        default:
          this.notificationService.error('No se pudo enviar el correo de recuperacion.');
      }
    } finally {
      this.loading = false;
    }
  }
}
