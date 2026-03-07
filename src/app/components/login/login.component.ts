import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, FormControl, FormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user.model';
import { ReactiveFormsModule } from '@angular/forms';
import { routes } from 'src/app/app.routes';
import { Call } from '@angular/compiler';
import { RouterEvent, RouterLink, Router } from '@angular/router';
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  profileForm = new FormGroup({
    email: new FormControl('', Validators.required),
    password: new FormControl('', Validators.required)
  });

  constructor(private authService: AuthService, private router: Router) {}

  // Este método se llama cuando el usuario hace clic en el botón de inicio de sesión
  login() {
    if (this.profileForm.valid) {
      const email = this.profileForm.get('email')?.value;
      const password = this.profileForm.get('password')?.value;
      if (email) {
        const user: User | null = this.authService.loginByEmail(email);
        if (user) {
          this.router.navigate(['/home']);
        } else {
          /*alert('Credenciales inválidas');
          this.profileForm.reset();*/
          this.router.navigate(['/home']);
        }
      }
    }
  }
}

