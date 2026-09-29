# Lovable Control MVP

Extensión Chrome MV3 para describir cambios de un proyecto web y aplicarlos al repositorio GitHub sincronizado con Lovable.

## Qué hace

1. Abres la extensión desde Chrome.
2. Configuras:
   - GitHub Personal Access Token con permisos de escritura en el repositorio.
   - owner y repositorio.
   - rama, normalmente `main`.
   - Gemini API key.
3. Escribes una instrucción:
   > Haz la portada más premium y optimiza las imágenes sin cambiar el contenido.
4. La extensión lee los archivos de código del repositorio.
5. Gemini propone cambios completos de archivos.
6. Puedes revisar el plan.
7. "Aplicar cambios" crea un commit mediante la API de GitHub.
8. Si el proyecto está correctamente sincronizado con Lovable, esos cambios pueden aparecer en Lovable.

## Instalar

1. Descarga y descomprime el ZIP.
2. Ve a `chrome://extensions`.
3. Activa "Modo desarrollador".
4. Pulsa "Cargar descomprimida".
5. Selecciona esta carpeta.
6. Abre la extensión desde el icono de extensiones.

## Importante

Este MVP NO escribe en el cuadro de chat de Lovable. Trabaja mediante GitHub. Por ello no hay una garantía de que todas las operaciones futuras de Lovable se reflejen inmediatamente en la interfaz de Lovable: depende de la sincronización GitHub del proyecto.

Las API keys se almacenan localmente en `chrome.storage.local`. Para una versión comercial conviene añadir un backend propio, autenticación OAuth y gestión segura de secretos.

## Próximas mejoras

- Detección automática del proyecto Lovable.
- Diff visual antes de aplicar.
- Botón "Deshacer último cambio".
- Edición de imágenes y assets.
- Lectura de errores de build.
- Captura de la vista previa y análisis visual.
- Aplicación de cambios por bloques en lugar de reemplazar archivos completos.
- OAuth de GitHub en lugar de tokens pegados manualmente.
