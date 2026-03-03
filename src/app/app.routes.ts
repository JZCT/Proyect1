import { Routes } from '@angular/router';
import { RoleGuard } from './guards/role.guard';

import { CursosGruposComponent } from './components/cursos-grupos/cursos-grupos.component';
import { LoginComponent } from './components/login/login.component';
import { HomeComponent } from './components/home/home.component';
import { PersonasComponent } from './components/personas/personas.component';
import { InstructoresComponent } from './components/instructores/instructores.component';
import { CursosComponent } from './components/cursos/cursos.component';
import { UsersComponent } from './components/usuarios/Usu.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: 'home',
    component: HomeComponent
  },
  {
    path: '',
    component: CursosGruposComponent,
    canActivate: [RoleGuard],
    data: { roles: ['admin', 'instructor', 'company'] }
  },
  {
    path: 'personas',
    component: PersonasComponent,
    canActivate: [RoleGuard],
    data: { roles: ['admin', 'instructor', 'company'] }
  },
  {
    path: 'instructores',
    component: InstructoresComponent,
    canActivate: [RoleGuard],
    data: { roles: ['admin'] }
  },
  {
    path: 'cursos',
    component: CursosComponent,
    canActivate: [RoleGuard],
    data: { roles: ['admin', 'instructor', 'company'] }
  },
  {
    path: 'usuario',
    component: UsersComponent,
    canActivate: [RoleGuard],
    data: { roles: ['admin'] }
  }
];