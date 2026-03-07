import { Routes } from '@angular/router';

import { CursosGruposComponent } from './components/cursos-grupos/cursos-grupos.component';
import { LoginComponent } from './components/login/login.component';
import { HomeComponent } from './components/home/home.component';
import { PersonasComponent } from './components/personas/personas.component';
import { InstructorComponent } from './components/Instructores/instructores.component';
import { CursosComponent } from './components/cursos/cursos.component';
import { UsersComponent } from './components/Usuarios/Usu.component'; // ✅ CORREGIDO

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
    component: CursosGruposComponent
  },
  {
    path: 'personas',
    component: PersonasComponent
  },
  {
    path: 'instructores', // mejor minúsculas
    component: InstructorComponent
  },
  {
    path: 'cursos',
    component: CursosComponent
  },
  {
    path: 'usuario',
    component: UsersComponent   // ✅ CORREGIDO
  }
];