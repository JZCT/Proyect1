import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Persona } from '../models/persona.model';

// @Injectable indica que este servicio puede ser inyectado en otros componentes
// providedIn: 'root' significa que estará disponible en toda la aplicación
@Injectable({
  providedIn: 'root'
})
export class PersonaService {
  // Array que almacena todas las personas (dato local, sin BD)
  private personas: Persona[] = [
    { id: 1, nombre: 'Juan Pérez', email: 'juan@example.com', telefono: '555-1234', estado: true },
    { id: 2, nombre: 'María García', email: 'maria@example.com', telefono: '555-5678', estado: true }
  ];

  // BehaviorSubject es un Observable que emite el estado actual y nuevos valores
  // Permite que los componentes se suscriban y reaccionen a cambios
  private personasSubject = new BehaviorSubject<Persona[]>(this.personas);
  // Observable público que otros componentes pueden suscribirse
  public personas$ = this.personasSubject.asObservable();
  
  // Contador para generar IDs únicos automáticamente
  private nextId = 3;

  constructor() {}

  // Retorna un Observable con la lista de personas actual
  // Los componentes se suscriben con .subscribe() para obtener actualizaciones
  getPersonas(): Observable<Persona[]> {
    return this.personas$;
  }

  // Añade una nueva persona a la lista
  addPersona(persona: Persona): void {
    // Genera un ID único auto-incrementable
    persona.id = this.nextId++;
    // Establece estado activo por defecto
    persona.estado = true;
    // Añade la persona al array
    this.personas.push(persona);
    // Notifica a todos los suscriptores del cambio
    this.personasSubject.next([...this.personas]);
  }

  // Actualiza una persona existente por su ID
  updatePersona(id: number, persona: Persona): void {
    // Busca el índice de la persona con ese ID
    const index = this.personas.findIndex(p => p.id === id);
    if (index !== -1) {
      // Reemplaza la persona manteniendo el ID
      this.personas[index] = { ...persona, id };
      // Notifica el cambio
      this.personasSubject.next([...this.personas]);
    }
  }

  // Elimina una persona por su ID
  deletePersona(id: number): void {
    // Filtra el array para remover la persona con ese ID
    this.personas = this.personas.filter(p => p.id !== id);
    // Notifica el cambio
    this.personasSubject.next([...this.personas]);
  }

  // Obtiene una persona específica por su ID
  getPersonaById(id: number): Persona | undefined {
    return this.personas.find(p => p.id === id);
  }
}
