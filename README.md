# CecaptaINS - Sitio Web Angular

Aplicación web moderna desarrollada con Angular 17.

## Requisitos Previos

- Node.js (versión 18 o superior)
- npm (gestor de paquetes de Node.js)

## Instalación

1. **Clonar o descargar el repositorio**
   ```bash
   cd CecaptaINS
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

## Desarrollo

Ejecutar el servidor de desarrollo:

```bash
npm start
```

La aplicación estará disponible en `http://localhost:4200/`

## Estructura del Proyecto

```
src/
├── app/
│   ├── components/
│   │   ├── home/           # Página principal
│   │   ├── about/          # Página de información
│   │   └── contact/        # Página de contacto
│   ├── services/           # Servicios compartidos
│   ├── app.component.*     # Componente raíz
│   └── app.routes.ts       # Configuración de rutas
├── assets/                 # Archivos estáticos
├── styles.scss             # Estilos globales
└── index.html              # Archivo HTML principal
```

## Características

- ✅ Componentes standalone modernos
- ✅ Enrutamiento lazy-loading
- ✅ Formularios reactivos
- ✅ Estilos SCSS
- ✅ Diseño responsive
- ✅ TypeScript strict mode

## Compilar para Producción

```bash
npm run build
```

Los archivos compilados se generarán en la carpeta `dist/cecaptains/`

## WordPress

Para dejar la aplicacion lista para incrustarse dentro de una pagina de WordPress:

```bash
npm run build:wordpress:embed
```

Ese comando:
- genera el build compatible con WordPress
- crea `dist/cecaptains/wordpress/cecapta-page-snippet.html`
- crea `dist/cecaptains/wordpress/cecapta-shortcode.php`

Recomendacion:
- usa `cecapta-shortcode.php` si quieres integracion mas estable en WordPress
- usa `cecapta-page-snippet.html` si prefieres pegarlo en un bloque HTML manual

## Testing

Ejecutar pruebas unitarias:

```bash
npm test
```

## Migracion Firebase

Para no depender del frontend al crear el primer admin o copiar datos entre proyectos, el repo incluye dos comandos:

```bash
npm run bootstrap:admin -- --dest-key RUTA_DESTINO.json --email admin@empresa.com --password admin123! --nombre "Administrador"
```

Ese comando crea o actualiza el usuario en Firebase Auth y su documento en `users/{uid}` del proyecto destino.

Para copiar colecciones de Firestore entre dos proyectos:

```bash
npm run migrate:firestore -- --source-key RUTA_ORIGEN.json --dest-key RUTA_DESTINO.json --collections users,cursos,instructores,personas,usuarios
```

Notas:
- Usa cuentas de servicio JSON, no el `firebaseConfig` del frontend.
- Los JSON de cuentas de servicio quedaron ignorados en `.gitignore`.
- Este flujo copia Firestore; la migracion completa de Authentication con passwords requiere un paso aparte.

## Herramientas Utilizadas

- **Angular 17** - Framework principal
- **TypeScript** - Lenguaje de programación
- **SCSS** - Preprocesador CSS
- **RxJS** - Programación reactiva
- **Angular CLI** - Herramienta de línea de comandos

## Contribución

Para contribuir al proyecto, por favor crea un fork y envía un pull request con tus cambios.

## Licencia

Este proyecto está disponible bajo la licencia MIT.

---

Desarrollado con ❤️ usando Angular
