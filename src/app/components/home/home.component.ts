import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  title = 'Panel Principal';
  description = 'Selecciona una vista para continuar. Todo esta organizado para operar rapido y sin complicaciones.';
  calloutText = 'Interfaz simple: primero selecciona modulo, luego usa el buscador.';
  currentUser: User | null = null;

  modules = [
    {
      title: 'Cursos y Personas',
      description: 'Resumen general de cursos, participantes e instructores en una sola vista.',
      route: '/',
      roles: ['admin', 'company', 'instructor', 'director']
    },
    {
      title: 'Cursos',
      description: 'Crea y edita cursos, fechas, empresa y representante.',
      route: '/cursos',
      roles: ['admin', 'company']
    },
    {
      title: 'Instructores',
      description: 'Administra instructores, foto y cursos asignados.',
      route: '/instructores',
      roles: ['admin']
    },
    {
      title: 'Personas',
      description: 'Registro individual, CURP obligatoria, carga masiva y reportes.',
      route: '/personas',
      roles: ['admin', 'instructor', 'company']
    },
    {
      title: 'Usuarios',
      description: 'Gestion de cuentas, roles y etiquetas de empresa.',
      route: '/usuario',
      roles: ['admin']
    }
  ];

  constructor(private authService: AuthService) {
    this.authService.currentUserData$.subscribe((user) => {
      this.currentUser = user;
      if (user?.role === 'director') {
        this.title = 'Panel Ejecutivo';
        this.description = 'Vista de solo lectura para revisar el estado general sin entrar en configuracion.';
        this.calloutText = 'Empieza por el resumen. La edicion esta reservada a administradores.';
        return;
      }

      this.title = 'Panel Principal';
      this.description = 'Selecciona una vista para continuar. Todo esta organizado para operar rapido y sin complicaciones.';
      this.calloutText = 'Interfaz simple: primero selecciona modulo, luego usa el buscador.';
    });
  }

  get visibleModules() {
    const role = this.currentUser?.role;
    if (!role) return [];
    return this.modules.filter((module) => module.roles.includes(role));
  }
}
