import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common'; //
import { FormsModule } from '@angular/forms';   //
import { AuthService } from '../../services/auth.service'; //
import { User, UserRole } from '../../models/user.model'; //

@Component({
  selector: 'app-users',
  standalone: true, //
  imports: [CommonModule, FormsModule], //
  templateUrl: './usu.component.html',
  styleUrl: './Usu.component.scss',
  // Se eliminó la línea de styleUrls para evitar el error de archivo no encontrado
  styles: [] 
})
export class UsersComponent implements OnInit {

  users: User[] = []; //

  newUser: User = { //
    nombre: '', //
    email: '', //
    role: 'company' //
  };

  roles: UserRole[] = ['admin', 'instructor', 'company']; //

  constructor(public authService: AuthService) {} //

  ngOnInit(): void {
    this.loadUsers(); //
  }

  loadUsers() {
    this.users = this.authService.getAllUsers(); //
  }

  addUser() {
    if (!this.newUser.nombre || !this.newUser.email) return; //

    this.authService.addUser({ ...this.newUser }); //

    this.newUser = { //
      nombre: '', //
      email: '', //
      role: 'company' //
    };

    this.loadUsers(); //
  }

  deleteUser(id?: number) {
    if (!id) return; //

    this.authService.deleteUser(id); //
    this.loadUsers(); //
  }
}