# Sistema de Validación de Saldos Fallecidos

Sistema web interno del Banco de Occidente para validación automatizada de documentos en casos de reclamación de saldos de personas fallecidas.

## 🎯 Funcionalidades

- **Carga de correos**: Soporta archivos .eml, .msg, .txt o texto pegado directamente
- **Procesamiento de documentos**: Análisis automático de PDFs e imágenes (registros civiles, cédulas, formularios, poderes)
- **Validación inteligente**: Extracción de datos, checklist documental y validación de consistencia
- **Generación automática**: Correos de respuesta listos para enviar

## 🚀 Instalación Local

```bash
# Clonar repositorio
git clone [URL_DE_TU_REPO]
cd saldos-fallecidosV3

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env y agregar tu ANTHROPIC_API_KEY

# Ejecutar servidor
npm start
```

La aplicación estará disponible en `http://localhost:3000`

## 📋 Variables de Entorno

```env
ANTHROPIC_API_KEY=tu_api_key_aqui
PORT=3000
HTTPS_PROXY=http://proxy.tu-empresa.com:8080  # Opcional: si usas proxy corporativo
```

## 🌐 Despliegue en Render.com

La aplicación está desplegada en Render.com con deploy automático desde GitHub.

### Configuración en Render:
1. Conectado al repositorio de GitHub
2. Build Command: `npm install`
3. Start Command: `node server.js`
4. Variables de entorno configuradas en el panel de Render

## 🏗️ Estructura del Proyecto

```
saldos-fallecidosV3/
├── public/
│   ├── index.html          # Interfaz principal
│   ├── presentacion.html   # Página de presentación
│   └── bocc.png           # Logo del banco
├── server.js              # Servidor Express + API
├── skill-prompt.md        # Prompt del sistema para Claude
├── package.json
├── .env.example          # Plantilla de variables de entorno
└── .gitignore
```

## 🔒 Seguridad

- Archivos sensibles (`.env`, `uploads/`, `node_modules/`) excluidos del repositorio
- Validación de tipos de archivo en el servidor
- Límite de tamaño de archivos: 20 MB
- Procesamiento en memoria temporal con limpieza automática

## 🛠️ Tecnologías

- **Backend**: Node.js, Express
- **IA**: Claude API (Anthropic)
- **Frontend**: HTML5, TailwindCSS, JavaScript
- **Procesamiento**: 
  - PDFs: pdf-parse
  - Correos .msg: @kenjiuno/msgreader
  - Imágenes: Análisis directo con Claude Vision

## 📝 Uso

1. Acceder a la aplicación web
2. Subir el correo de la oficina (archivo o texto)
3. Adjuntar los documentos PDF escaneados
4. Hacer clic en "Analizar y validar"
5. Revisar el análisis automático y copiar el correo de respuesta

## 👥 Equipo

**VP Jurídica - Banco de Occidente**

---

*Herramienta interna · Uso exclusivo Banco de Occidente*
