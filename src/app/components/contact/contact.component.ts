import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss'
})
export class ContactComponent {
  title = 'Contacto';
  
  contactForm = {
    name: '',
    email: '',
    message: ''
  };

  submitted = false;

  onSubmit() {
    this.submitted = true;
    console.log('Formulario enviado:', this.contactForm);
    // Aquí iría la lógica para enviar el formulario
    
    // Limpiar formulario después de 2 segundos
    setTimeout(() => {
      this.resetForm();
    }, 2000);
  }

  resetForm() {
    this.contactForm = {
      name: '',
      email: '',
      message: ''
    };
    this.submitted = false;
  }
}
