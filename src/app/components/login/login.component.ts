import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms'; // IMPORTAR ReactiveFormsModule
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from 'src/app/services/notification.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule], // AGREGAR ReactiveFormsModule y NotificationComponent
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  loginForm!: FormGroup; 
  loading = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder, 
    private authService: AuthService,
    private router: Router,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    // 👇 INICIALIZAR EL FORMULARIO
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  // 👇 MÉTODO onSubmit (antes llamado login)
  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const { email, password } = this.loginForm.value;

    this.authService.login(email, password)
      .then(() => {
        console.log('Login exitoso');
        this.router.navigate(['/']);
      })
      .catch((error: any) => {
        console.error('Error de login:', error);
        
        // Manejar errores específicos
        switch (error.code) {
          case 'auth/invalid-credential':
          case 'auth/user-not-found':
          case 'auth/wrong-password':
            this.errorMessage = 'Email o contraseña incorrectos';
            break;
          case 'auth/too-many-requests':
            this.errorMessage = 'Demasiados intentos fallidos. Intenta más tarde';
            break;
          case 'auth/user-disabled':
            this.errorMessage = 'Esta cuenta ha sido deshabilitada';
            break;
          default:
            this.errorMessage = 'Error al iniciar sesión. Intenta de nuevo';
        }
      })
      .finally(() => {
        this.loading = false;
      });
  }

  // 👇 MÉTODO AUXILIAR para marcar todos los campos como tocados
  private markAllAsTouched(): void {
    Object.values(this.loginForm.controls).forEach(control => {
      control.markAsTouched();
    });
  }

  // 👇 GETTERS para facilitar el acceso en el template
  get email() { return this.loginForm.get('email'); }
  get password() { return this.loginForm.get('password'); }
}