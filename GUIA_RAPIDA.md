# 📚 GUÍA RÁPIDA DE LA ARQUITECTURA

## 🏗️ Capas de la Aplicación

```
┌─────────────────────────────────────┐
│   COMPONENTES (UI)                  │
│   (Vistas interactivas)             │
│   - CursosGruposComponent           │
│   - PersonasGruposComponent         │
└────────────┬────────────────────────┘
             │ Inyecta
             ↓
┌─────────────────────────────────────┐
│   SERVICIOS (Lógica)                │
│   (Manejan datos con Observables)   │
│   - PersonaService                  │
│   - CursoService                    │
│   - GrupoService                    │
└────────────┬────────────────────────┘
             │ Almacenan/Modifican
             ↓
┌─────────────────────────────────────┐
│   MODELOS (Datos)                   │
│   (Interfaces TypeScript)           │
│   - Persona                         │
│   - Curso                           │
│   - Grupo                           │
└─────────────────────────────────────┘
```

## 🔄 Flujo de Datos (Ejemplo: Crear un Curso)

```
Usuario escribe "Angular"
        ↓
Usuario clickea "Guardar"
        ↓
Componente llama: cursoService.addCurso()
        ↓
Servicio añade a array y emite: personasSubject.next([...])
        ↓
Observable notifica a TODOS los suscriptores
        ↓
Componente recibe nuevos datos en subscribe()
        ↓
this.cursos = cursos (variable se actualiza)
        ↓
Angular detecta cambio (Change Detection)
        ↓
Template re-renderiza (*ngFor actualiza la lista)
        ↓
Usuario ve el nuevo curso en pantalla
```

## 📝 Operaciones CRUD Explicadas

### CREATE (Crear)
```typescript
// En el componente:
addCurso() {
  this.cursoService.addCurso(this.newCurso);
}

// En el servicio:
addCurso(curso: Curso): void {
  curso.id = this.nextId++;        // Genera ID
  this.cursos.push(curso);         // Añade al array
  this.cursosSubject.next([...this.cursos]); // Emite cambio
}
```

### READ (Leer)
```typescript
// En ngOnInit():
this.cursoService.getCursos().subscribe(cursos => {
  this.cursos = cursos;  // Recibe los datos
});

// En el template:
<div *ngFor="let curso of cursos">
  {{ curso.nombre }}
</div>
```

### UPDATE (Actualizar)
```typescript
// En el componente:
updateCurso() {
  this.cursoService.updateCurso(this.editingCursoId, this.editingCurso);
}

// En el servicio:
updateCurso(id: number, curso: Curso): void {
  const index = this.cursos.findIndex(c => c.id === id);
  this.cursos[index] = { ...curso, id };
  this.cursosSubject.next([...this.cursos]);
}
```

### DELETE (Eliminar)
```typescript
// En el componente:
deleteCurso(id: number) {
  this.cursoService.deleteCurso(id);
}

// En el servicio:
deleteCurso(id: number): void {
  this.cursos = this.cursos.filter(c => c.id !== id);
  this.cursosSubject.next([...this.cursos]);
}
```

## 🔗 Relaciones de Datos

### Jerarquía
```
Curso (1)
  ├─ Grupo (1..N)
  │   ├─ Personas (0..N)
  │   └─ Grupo_id apunta a Curso_id
  └─ Curso_id en Grupo
```

### Ejemplo Real
```json
Curso: {
  "id": 1,
  "nombre": "Angular",
  "grupos": [1, 2]  ← IDs de grupos
}

Grupo: {
  "id": 1,
  "nombre": "Grupo A",
  "cursoId": 1,      ← Pertenece a Curso 1
  "personas": [1, 2, 3]  ← IDs de personas
}

Persona: {
  "id": 1,
  "nombre": "Juan"
}
```

## 🎯 Claves de RxJS

### Observable
```typescript
// Una "fuente de datos" que puede emitir múltiples valores
const data$ = service.getData();  // Observable
data$.subscribe(value => {        // Suscribirse
  console.log(value);
});
```

### BehaviorSubject
```typescript
// Observable especial que SIEMPRE tiene un valor
const subject = new BehaviorSubject<Persona[]>([]);
subject.next([...nuevosPersonas]);  // Emite
subject.asObservable();             // Convierto a Observable
```

### Subscribe
```typescript
// Los componentes "escuchan" los Observables
this.service.datos$.subscribe(data => {
  this.data = data;  // Cuando hay cambio, ejecuta esto
});
```

## 📦 Estructura de Carpetas

```
src/
├── app/
│   ├── components/
│   │   ├── cursos-grupos/
│   │   │   ├── cursos-grupos.component.ts      (Lógica)
│   │   │   ├── cursos-grupos.component.html    (HTML)
│   │   │   └── cursos-grupos.component.scss    (Estilos)
│   │   ├── personas-grupos/
│   │   │   ├── personas-grupos.component.ts
│   │   │   ├── personas-grupos.component.html
│   │   │   └── personas-grupos.component.scss
│   │   └── [otros componentes...]
│   ├── services/
│   │   ├── persona.service.ts    (Lógica de personas)
│   │   ├── curso.service.ts      (Lógica de cursos)
│   │   └── grupo.service.ts      (Lógica de grupos)
│   ├── models/
│   │   ├── persona.model.ts      (Interfaz)
│   │   ├── curso.model.ts        (Interfaz)
│   │   └── grupo.model.ts        (Interfaz)
│   ├── app.component.ts          (Componente principal)
│   ├── app.routes.ts             (Rutas/Navegación)
│   └── app.component.html        (Layout principal)
└── styles.scss                   (Estilos globales)
```

## 🚀 Cómo Funciona Angular

1. **App se inicia**
   - main.ts → bootstrapApplication → AppComponent

2. **AppComponent carga**
   - Lee app.routes.ts
   - Carga el componente de la ruta actual
   - Muestra el contenido en <router-outlet>

3. **Componente se carga (ej: CursosGruposComponent)**
   - Constructor: Inyecta servicios
   - ngOnInit(): Carga datos
   - Template renderiza con datos
   - Usuario interactúa

4. **Usuario hace algo (click, form submit)**
   - Componente llama a método del servicio
   - Servicio modifica datos
   - Servicio emite cambio
   - Observable notifica al componente
   - Componente recibe nuevos datos
   - Angular re-renderiza

## 💡 Tips Importantes

✅ **Servicios con BehaviorSubject** = Datos en tiempo real
✅ **Inyección de dependencias** = Código desacoplado y testeable
✅ **Modelos/Interfaces** = Tipado fuerte, menos errores
✅ **Componentes standalone** = Más simple, sin módulos
✅ **Two-way binding (ngModel)** = Form data ↔ Component

## ⚙️ Próximo Paso: Firebase

Cuando agregues Firebase, solo cambiarán los servicios:

```typescript
// ANTES (Local)
addCurso(curso: Curso) {
  this.cursos.push(curso);
  this.cursosSubject.next([...this.cursos]);
}

// DESPUÉS (Firebase)
addCurso(curso: Curso) {
  this.firestore.collection('cursos').add(curso);
  // Firestore se encarga de emitir cambios automáticamente
}
```

Los **componentes NO cambian** porque siguen recibiendo Observables.
