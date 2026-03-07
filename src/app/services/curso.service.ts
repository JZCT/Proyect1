import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Curso } from '../models/curso.model';

@Injectable({
  providedIn: 'root'
})
export class CursoService {
  // Array que almacena los cursos
  private cursos: Curso[] = [
    { 
      id: 1, 
      nombre: 'Angular Básico', 
      descripcion: 'Introducción a Angular', 
      Fecha_inicio: undefined,
      Fecha_fin: undefined,
      nom_representante: 'Juan Pérez',
      num_represnetantes: "xxxx-xxxx-xx",
      personasIds: [1, 2],    // Personas asignadas
      estado: true 
    },
    { 
      id: 2, 
      nombre: 'TypeScript Avanzado', 
      descripcion: 'TypeScript nivel avanzado', 
      Fecha_inicio: undefined,
      Fecha_fin: undefined,
      nom_representante: 'María López',
      num_represnetantes: "xxxx-xxxx-xx",
      personasIds: [2],       // Personas asignadas
      estado: true 
    }
  ];

  private cursosSubject = new BehaviorSubject<Curso[]>(this.cursos);
  public cursos$ = this.cursosSubject.asObservable();
  private nextId = 3;

  constructor() {}

  // Retorna un Observable con la lista de cursos
  getCursos(): Observable<Curso[]> {
    return this.cursos$;
  }

  // Añade un nuevo curso
  addCurso(curso: Curso): void {
    curso.id = this.nextId++;
    curso.estado = true;
    // Si el curso no tiene personas, inicializa un array vacío
    if (!curso.personasIds) {
      curso.personasIds = [];
    }
    this.cursos.push(curso);
    this.cursosSubject.next([...this.cursos]);
  }

  // Actualiza un curso existente
  updateCurso(id: number, curso: Curso): void {
    const index = this.cursos.findIndex(c => c.id === id);
    if (index !== -1) {
      this.cursos[index] = { ...curso, id };
      this.cursosSubject.next([...this.cursos]);
    }
  }

  // Elimina un curso por su ID
  deleteCurso(id: number): void {
    this.cursos = this.cursos.filter(c => c.id !== id);
    this.cursosSubject.next([...this.cursos]);
  }

  // Obtiene un curso específico
  getCursoById(id: number): Curso | undefined {
    return this.cursos.find(c => c.id === id);
  }

  // Añade una persona a un curso específico
  addPersonaToCurso(cursoId: number, personaId: number): void {
    const curso = this.cursos.find(c => c.id === cursoId);
    if (curso) {
      if (!curso.personasIds) {
        curso.personasIds = [];
      }
      // Solo añade si no está duplicada
      if (!curso.personasIds.includes(personaId)) {
        curso.personasIds.push(personaId);
        this.cursosSubject.next([...this.cursos]);
      }
    }
  }

  // Remueve una persona de un curso
  removePersonaFromCurso(cursoId: number, personaId: number): void {
    const curso = this.cursos.find(c => c.id === cursoId);
    if (curso) {
      // Filtra para remover el personaId
      curso.personasIds = (curso.personasIds || []).filter(id => id !== personaId);
      this.cursosSubject.next([...this.cursos]);
    }
  }
}

