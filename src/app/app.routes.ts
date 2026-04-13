import { Routes } from '@angular/router';
import { roleGuard } from './guards/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'home',
    loadComponent: () => import('./components/home/home.component').then(m => m.HomeComponent),
    canActivate: [roleGuard],
    data: { roles: ['admin', 'director'] }
  },
  {
    path: '',
    loadComponent: () => import('./components/cursos-grupos/cursos-grupos.component').then(m => m.CursosGruposComponent),
    canActivate: [roleGuard],
    data: { roles: ['admin', 'instructor', 'director', 'company'] }
  },
  {
    path: 'personas',
    loadComponent: () => import('./components/personas/personas.component').then(m => m.PersonasComponent),
    canActivate: [roleGuard],
    data: { roles: ['admin', 'instructor'] }
  },
  {
    path: 'instructores',
    loadComponent: () => import('./components/Instructores/instructores.component').then(m => m.InstructorComponent),
    canActivate: [roleGuard],
    data: { roles: ['admin'] }
  },
  {
    path: 'cursos',
    loadComponent: () => import('./components/cursos/cursos.component').then(m => m.CursosComponent),
    canActivate: [roleGuard],
    data: { roles: ['admin'] }
  },
  {
    path: 'usuario',
    loadComponent: () => import('./components/Usuarios/Usu.component').then(m => m.UsersComponent),
    canActivate: [roleGuard],
    data: { roles: ['admin'] }
  },
  {
    path: '**',
    redirectTo: ''
  }
];
