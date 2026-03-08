import { Routes } from '@angular/router';

import { CursosGruposComponent } from './components/cursos-grupos/cursos-grupos.component';
import { LoginComponent } from './components/login/login.component';
import { HomeComponent } from './components/home/home.component';
import { PersonasComponent } from './components/personas/personas.component';
import { InstructorComponent } from './components/Instructores/instructores.component';
import { CursosComponent } from './components/cursos/cursos.component';
import { UsersComponent } from './components/Usuarios/Usu.component';
import { roleGuard } from './guards/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: 'home',
    component: HomeComponent,
    canActivate: [roleGuard],
    data: { roles: ['admin', 'company'] }
  },
  {
    path: '',
    component: CursosGruposComponent,
    canActivate: [roleGuard],
    data: { roles: ['admin', 'instructor', 'company'] }
  },
  {
    path: 'personas',
    component: PersonasComponent,
    canActivate: [roleGuard],
    data: { roles: ['admin', 'instructor'] }
  },
  {
    path: 'instructores',
    component: InstructorComponent,
    canActivate: [roleGuard],
    data: { roles: ['admin'] }
  },
  {
    path: 'cursos',
    component: CursosComponent,
    canActivate: [roleGuard],
    data: { roles: ['admin', 'company'] }
  },
  {
    path: 'usuario',
    component: UsersComponent,
    canActivate: [roleGuard],
    data: { roles: ['admin'] }
  },
  {
    path: '**',
    redirectTo: ''
  }
];
