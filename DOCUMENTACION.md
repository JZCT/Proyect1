/**
 * DOCUMENTACIÓN COMPLETA - ARQUITECTURA DEL PROYECTO
 * ===================================================
 * 
 * ESTRUCTURA DEL PROYECTO:
 * ┌─ Cursos (varios)
 * │  └─ Grupos (varios por curso)
 * │     └─ Personas (varias por grupo)
 */

/**
 * 1. MODELOS (models/)
 * ====================
 * Los modelos definen la estructura de datos usando interfaces TypeScript
 * 
 * Persona.model.ts:
 *   - id: Identificador único
 *   - nombre: Nombre completo
 *   - email: Para contacto
 *   - telefono: Para contacto
 *   - estado: Activo/Inactivo
 * 
 * Curso.model.ts:
 *   - id: Identificador único
 *   - nombre: Nombre del curso
 *   - descripcion: Descripción
 *   - duracion: "40 horas"
 *   - estado: Activo/Inactivo
 *   - grupos[]: Array de IDs de grupos (RELACIÓN)
 * 
 * Grupo.model.ts:
 *   - id: Identificador único
 *   - nombre: Nombre del grupo
 *   - descripcion: Descripción
 *   - cursoId: ID del curso padre (RELACIÓN)
 *   - personas[]: Array de IDs de personas (RELACIÓN)
 *   - estado: Activo/Inactivo
 */

/**
 * 2. SERVICIOS (services/)
 * ========================
 * Los servicios manejan la lógica de datos y operaciones CRUD.
 * Utilizan RxJS (Reactive Extensions) para manejar datos reactivos.
 * 
 * CONCEPTOS CLAVE:
 * - Observable: Un stream de datos que puede emitir múltiples valores
 * - BehaviorSubject: Un tipo especial de Observable que siempre tiene un valor
 * - .subscribe(): Los componentes se suscriben para recibir actualizaciones
 * 
 * PersonaService:
 *   - getPersonas(): Retorna Observable con lista de personas
 *   - addPersona(persona): Añade nueva persona
 *   - updatePersona(id, persona): Actualiza persona existente
 *   - deletePersona(id): Elimina persona
 *   - getPersonaById(id): Obtiene una persona específica
 * 
 * CursoService:
 *   - Lo mismo pero para cursos
 *   - Mantiene relación con grupos
 * 
 * GrupoService:
 *   - Lo mismo pero para grupos
 *   - Métodos especiales:
 *     * getGruposByCurso(cursoId): Obtiene grupos de un curso
 *     * addPersonaToGrupo(grupoId, personaId): Asigna persona a grupo
 *     * removePersonaFromGrupo(grupoId, personaId): Remueve persona
 */

/**
 * 3. COMPONENTES (components/)
 * ============================
 * Los componentes son la interfaz visual. Interactúan con servicios
 * para obtener/modificar datos y mostrar la UI.
 * 
 * CICLO DE VIDA:
 * 1. El componente se carga
 * 2. ngOnInit() se ejecuta (hook de ciclo de vida)
 * 3. Se cargan datos de los servicios
 * 4. El template HTML se renderiza con los datos
 * 5. El usuario interactúa (click, form submit)
 * 6. Se llama al servicio para modificar datos
 * 7. El servicio emite los nuevos datos
 * 8. El componente recibe los nuevos datos
 * 9. Angular detecta cambios y re-renderiza
 * 
 * CursosGruposComponent:
 *   - Panel izquierdo: Lista de cursos
 *   - Panel derecho: Grupos del curso seleccionado
 *   - Permite crear/editar/eliminar cursos y grupos
 *   - Jerarquía: Selecciona curso → Ve sus grupos
 * 
 * PersonasGruposComponent:
 *   - Panel izquierdo: Lista de personas
 *   - Panel derecho: Grupos disponibles
 *   - Permite crear/editar/eliminar personas
 *   - Permite asignar personas a grupos
 *   - Jerarquía: Selecciona grupo → Añade personas
 */

/**
 * 4. FLUJO DE DATOS (Data Flow)
 * =============================
 * 
 * CREAR:
 * Usuario escribe en form → Click "Guardar" → Llama addCurso() → 
 * Service añade a array y emite → Observable actualiza → 
 * Componente recibe nuevo dato → Template se re-renderiza
 * 
 * LEER:
 * ngOnInit() → Suscribe a service.cursos$ → Recibe array → 
 * Muestra en template con *ngFor
 * 
 * ACTUALIZAR:
 * Usuario hace click "Editar" → Carga datos en form → 
 * Usuario modifica → Click "Actualizar" → Llama updateCurso() → 
 * Service actualiza array y emite → Componente recibe cambios
 * 
 * ELIMINAR:
 * Usuario hace click "Eliminar" → Confirma → Llama deleteCurso() → 
 * Service filtra array y emite → Componente recibe nuevo array sin elemento
 */

/**
 * 5. RELACIONES ENTRE DATOS
 * ==========================
 * 
 * ESTRUCTURA JERÁRQUICA:
 * 
 * Curso {
 *   id: 1,
 *   nombre: "Angular",
 *   grupos: [1, 2]        ← IDs de grupos
 * }
 * 
 * Grupo {
 *   id: 1,
 *   nombre: "Grupo A",
 *   cursoId: 1,           ← Pertenece al curso 1
 *   personas: [1, 2, 3]   ← IDs de personas
 * }
 * 
 * Persona {
 *   id: 1,
 *   nombre: "Juan"
 * }
 * 
 * ESTO PERMITE:
 * - Un curso puede tener múltiples grupos
 * - Un grupo pertenece a un solo curso
 * - Un grupo puede tener múltiples personas
 * - Una persona puede estar en múltiples grupos (asignándola a cada uno)
 */

/**
 * 6. TECNOLOGÍAS USADAS
 * =====================
 * 
 * Angular 17:
 *   - Framework para construir UIs
 *   - Componentes standalone (no necesitan módulos)
 *   - Two-way binding con ngModel
 *   - Inyección de dependencias
 * 
 * TypeScript:
 *   - Superset de JavaScript con tipos
 *   - Interfaces para definir estructuras
 *   - Better autocompletion y error catching
 * 
 * RxJS:
 *   - Programación reactiva
 *   - Observables para streams de datos
 *   - BehaviorSubject para estado compartido
 * 
 * SCSS:
 *   - CSS con superpoderes (variables, anidamiento)
 *   - Estilos más organizados
 */

/**
 * 7. PATRONES DE DISEÑO
 * =====================
 * 
 * Observer Pattern:
 *   - Los servicios son "observables"
 *   - Los componentes se "suscriben"
 *   - Cuando hay cambios, todos los suscriptores reciben notificación
 * 
 * Singleton Pattern:
 *   - providedIn: 'root' significa que hay UNA sola instancia del servicio
 *   - Todos los componentes comparten la misma instancia
 * 
 * Component Pattern:
 *   - Componentes reutilizables
 *   - Cada componente es standalone
 *   - Se pueden importar en otros componentes
 */

/**
 * 8. PRÓXIMAS MEJORAS CON FIREBASE
 * ==================================
 * 
 * Actual (Local):
 *   - Los datos están en memoria (se pierden al recargar)
 *   - Array de objetos en cada servicio
 * 
 * Con Firebase:
 *   - Los datos se guardan en la nube
 *   - Reemplazar BehaviorSubject con Firestore collections
 *   - Cambio mínimo en componentes (siguen siendo Observables)
 *   - Mantener la misma interfaz de servicios
 * 
 * Ejemplo de cambio:
 * 
 * // ANTES (Local)
 * getPersonas(): Observable<Persona[]> {
 *   return this.personas$; // BehaviorSubject local
 * }
 * 
 * // DESPUÉS (Firebase)
 * getPersonas(): Observable<Persona[]> {
 *   return this.firestore.collection('personas').snapshotChanges()
 *     .pipe(map(...)); // Observable de Firestore
 * }
 * 
 * // Los componentes NO cambian, siguen haciendo .subscribe()
 */

/**
 * 9. CÓMO AGREGAR FIREBASE
 * =========================
 * 
 * Pasos (cuando quieras implementarlo):
 * 1. npm install firebase @angular/fire
 * 2. Crear cuenta en Firebase
 * 3. Configurar credenciales en environment.ts
 * 4. Reemplazar métodos del servicio para usar Firestore
 * 5. Los componentes siguen sin cambiar (magia de Observables)
 */
