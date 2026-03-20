import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { Subscription } from 'rxjs';

interface LoginThrottleState {
  attempts: number;
  lockedUntil: number;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit, OnDestroy {
  private readonly MAX_LOGIN_ATTEMPTS = 6;
  private readonly LOGIN_COOLDOWN_MS = 15 * 60 * 1000;
  private readonly LOGIN_STORAGE_PREFIX = 'cecaptains-login-throttle';
  private emailSubscription?: Subscription;
  private cooldownTimerId: number | null = null;

  loginForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required, Validators.minLength(6)])
  });

  loading = false;
  loginLocked = false;
  loginLockMessage = '';
  loginAttemptsRemaining = 6;

  constructor(
    private authService: AuthService,
    private router: Router,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    const emailControl = this.loginForm.get('email');
    this.emailSubscription = emailControl?.valueChanges.subscribe(() => {
      this.syncLoginThrottleState();
    });
    this.syncLoginThrottleState();
  }

  ngOnDestroy(): void {
    this.emailSubscription?.unsubscribe();
    this.stopCooldownTimer();
  }

  async login() {
    if (this.loginForm.invalid) {
      this.notificationService.warning('Por favor completa todos los campos correctamente');
      return;
    }

    this.loading = true;

    const email = (this.loginForm.get('email')?.value || '').trim();
    const password = this.loginForm.get('password')?.value || '';
    this.syncLoginThrottleState();

    if (this.loginLocked) {
      this.notificationService.warning(this.loginLockMessage || 'Demasiados intentos. Intenta mas tarde.');
      this.loading = false;
      return;
    }

    try {
      const credential = await this.authService.login(email, password);
      const userData = await this.authService.getUserData(credential.user.uid);

      this.clearLoginThrottleState(email);
      this.stopCooldownTimer();
      this.loginLocked = false;
      this.loginAttemptsRemaining = this.MAX_LOGIN_ATTEMPTS;
      this.loginLockMessage = '';

      if (!userData || !['admin', 'company', 'instructor'].includes(userData.role)) {
        await this.authService.logout();
        this.notificationService.error(
          'Tu cuenta no tiene un perfil valido o no tiene permisos para ingresar.'
        );
        return;
      }

      const targetRoute = userData.role === 'instructor' ? '/' : '/home';

      this.notificationService.success('Sesion iniciada correctamente');
      await this.authService.waitForCurrentUserData(credential.user.uid);
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      const navigated = await this.router.navigate([targetRoute]);
      if (!navigated) {
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        await this.router.navigate([targetRoute]);
      }
    } catch (error: any) {
      console.error('Error de login:', error);
      const loginErrorCode = error?.code || '';
      const shouldCountFailure = this.shouldCountLoginFailure(loginErrorCode);

      if (shouldCountFailure) {
        this.registerFailedLoginAttempt(email);
        if (this.loginLocked) {
          this.notificationService.error(this.loginLockMessage || 'Demasiados intentos. Intenta de nuevo mas tarde.');
          return;
        }
      }

      switch (loginErrorCode) {
        case 'auth/user-not-found':
          this.notificationService.error('Usuario no encontrado');
          break;
        case 'auth/wrong-password':
          this.notificationService.error('Contrasena incorrecta');
          break;
        case 'auth/invalid-credential':
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

  get canSubmitLogin(): boolean {
    return !this.loading && !this.loginLocked && this.loginForm.valid;
  }

  private syncLoginThrottleState(): void {
    const email = this.normalizeLoginEmail(this.loginForm.get('email')?.value || '');
    if (!email) {
      this.stopCooldownTimer();
      this.loginLocked = false;
      this.loginAttemptsRemaining = this.MAX_LOGIN_ATTEMPTS;
      this.loginLockMessage = '';
      return;
    }

    const state = this.readLoginThrottleState(email);
    const now = Date.now();

    if (state.lockedUntil > now) {
      this.startCooldownTimer(email, state.lockedUntil);
      return;
    }

    if (state.lockedUntil > 0 && state.lockedUntil <= now) {
      this.clearLoginThrottleState(email);
    }

    this.stopCooldownTimer();
    this.loginLocked = false;
    this.loginAttemptsRemaining = Math.max(0, this.MAX_LOGIN_ATTEMPTS - state.attempts);
    this.loginLockMessage = state.attempts > 0
      ? `Te quedan ${this.loginAttemptsRemaining} intento${this.loginAttemptsRemaining === 1 ? '' : 's'} antes del bloqueo.`
      : '';
  }

  private registerFailedLoginAttempt(email: string): void {
    const normalizedEmail = this.normalizeLoginEmail(email);
    if (!normalizedEmail) return;

    const currentState = this.readLoginThrottleState(normalizedEmail);
    const nextAttempts = Math.min(this.MAX_LOGIN_ATTEMPTS, currentState.attempts + 1);
    const nextState: LoginThrottleState = {
      attempts: nextAttempts,
      lockedUntil: currentState.lockedUntil
    };

    if (nextAttempts >= this.MAX_LOGIN_ATTEMPTS) {
      nextState.lockedUntil = Date.now() + this.LOGIN_COOLDOWN_MS;
    }

    this.writeLoginThrottleState(normalizedEmail, nextState);
    this.syncLoginThrottleState();
  }

  private startCooldownTimer(email: string, lockedUntil: number): void {
    this.stopCooldownTimer();

    const tick = () => {
      const remainingMs = lockedUntil - Date.now();
      if (remainingMs <= 0) {
        this.clearLoginThrottleState(email);
        this.stopCooldownTimer();
        this.syncLoginThrottleState();
        return;
      }

      this.loginLocked = true;
      this.loginAttemptsRemaining = 0;
      this.loginLockMessage = `Demasiados intentos. Intenta de nuevo en ${this.formatCooldown(remainingMs)}.`;
    };

    tick();
    this.cooldownTimerId = window.setInterval(tick, 1000);
  }

  private stopCooldownTimer(): void {
    if (this.cooldownTimerId !== null) {
      window.clearInterval(this.cooldownTimerId);
      this.cooldownTimerId = null;
    }
  }

  private shouldCountLoginFailure(errorCode: string): boolean {
    return ['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential'].includes(errorCode);
  }

  private readLoginThrottleState(email: string): LoginThrottleState {
    const storageKey = this.getLoginThrottleStorageKey(email);

    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        return { attempts: 0, lockedUntil: 0 };
      }

      const parsed = JSON.parse(raw) as Partial<LoginThrottleState>;
      return {
        attempts: this.normalizeAttemptCount(parsed.attempts),
        lockedUntil: this.normalizeLockTimestamp(parsed.lockedUntil)
      };
    } catch {
      return { attempts: 0, lockedUntil: 0 };
    }
  }

  private writeLoginThrottleState(email: string, state: LoginThrottleState): void {
    try {
      localStorage.setItem(this.getLoginThrottleStorageKey(email), JSON.stringify(state));
    } catch {
      // Si localStorage no esta disponible, simplemente no persistimos el bloqueo.
    }
  }

  private clearLoginThrottleState(email: string): void {
    try {
      localStorage.removeItem(this.getLoginThrottleStorageKey(email));
    } catch {
      // Sin-op.
    }
  }

  private getLoginThrottleStorageKey(email: string): string {
    return `${this.LOGIN_STORAGE_PREFIX}:${this.normalizeLoginEmail(email)}`;
  }

  private normalizeLoginEmail(email: string): string {
    return (email || '').trim().toLowerCase();
  }

  private normalizeAttemptCount(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return 0;
    }

    return Math.min(this.MAX_LOGIN_ATTEMPTS, Math.floor(numeric));
  }

  private normalizeLockTimestamp(value: unknown): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }

  private formatCooldown(remainingMs: number): string {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes <= 0) {
      return `${seconds}s`;
    }

    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
}
