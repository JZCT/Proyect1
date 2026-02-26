import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  // Cambiado de profileForm a loginForm para consistencia
  loginForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required, Validators.minLength(6)])
  });

  errorMessage: string = '';
  loading: boolean = false;

  constructor(private authService: AuthService, private router: Router) {}

  async login() {
    if (this.loginForm.invalid) {
      this.errorMessage = 'Por favor completa todos los campos correctamente';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const email = this.loginForm.get('email')?.value || '';
    const password = this.loginForm.get('password')?.value || '';

    try {
      await this.authService.login(email, password);
      this.router.navigate(['/home']);
    } catch (error: any) {
      console.error('Error de login:', error);
      switch (error.code) {
        case 'auth/user-not-found':
          this.errorMessage = 'Usuario no encontrado';
          break;
        case 'auth/wrong-password':
          this.errorMessage = 'Contraseña incorrecta';
          break;
        case 'auth/invalid-email':
          this.errorMessage = 'Email inválido';
          break;
        case 'auth/user-disabled':
          this.errorMessage = 'Usuario deshabilitado';
          break;
        default:
          this.errorMessage = 'Error al iniciar sesión. Intenta de nuevo.';
      }
    } finally {
      this.loading = false;
    }
  }
}