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

## Testing

Ejecutar pruebas unitarias:

```bash
npm test
```

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
