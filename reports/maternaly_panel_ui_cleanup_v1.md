# Maternaly panel UI cleanup v1

## Estado

- Repo: `D:\PAU OVIDI MM\Documents\Chatbot Maternaly Clean`
- Rama: `codex/maternaly-panel-ui-cleanup-v1`
- Alcance: solo interfaz del panel de conversaciones.

## Causa

El panel funcionaba, pero la vista principal seguia mostrando demasiado ruido tecnico y aspecto de demo: chips de provider/LLM/Sheets/writes, aviso de sandbox en el composer y boton de video mock.

## Cambios visuales

- El header conserva logo Maternaly, navegacion central y boton `Web Maternaly`, con un ancho mas consistente con el panel.
- `Estado tecnico` permanece accesible como bloque plegado.
- Los chips tecnicos no se renderizan en el panel cerrado:
  - provider WhatsApp
  - LLM
  - Sheets
  - Writes
- El composer manual queda limpio:
  - textarea de respuesta
  - boton `Enviar`
- Se elimina de la vista normal:
  - texto `Twilio Sandbox activo`
  - boton `Adjuntar video` mock
  - leyendas de entorno demo/provider

## Sidebar

- Se agrupa el estado de refresco/error en un contenedor compacto.
- La columna izquierda usa filas explicitas: marca, metricas, buscador, estado, filtros y lista.
- La lista de conversaciones queda como fila flexible con `overflow-y:auto`, sin anclaje abajo ni huecos muertos intencionados.

## No tocado

- Logica conversacional.
- NLU/policy.
- Twilio/YCloud.
- Google Sheets.
- Variables de entorno, secretos o defaults de escritura.
- Deploy/restart.

## Tests

- Tests especificos de panel y branding actualizados para confirmar que:
  - `Twilio Sandbox activo` no aparece en render normal.
  - `Adjuntar video` no aparece en render normal.
  - `Proveedor:`, `LLM:`, `Sheets:` y `Writes:` no aparecen cuando `Estado tecnico` esta cerrado.
  - `Estado tecnico`, `Web Maternaly`, `Inbox WhatsApp Maternaly` y `Enviar` siguen presentes.
  - La lista mantiene estructura scroll.

Resultados ejecutados:

- `npm.cmd run test:run -- src/app/admin/conversations/panel.test.tsx src/lib/hotel/conversations/brand-copy.test.tsx`: OK, 2 archivos, 21 tests.
- `npm.cmd run lint`: OK.
- `npm.cmd run test:run`: OK, 65 archivos, 434 tests, 1 todo.
- `npm.cmd run build`: OK.
- `npm.cmd run smoke`: OK.
- `npm.cmd run smoke:http`: OK contra servidor local temporal en `127.0.0.1:3000`; sin WhatsApp real ni escritura real en Sheets.

## Como probar en EasyPanel

1. Desplegar la rama `codex/maternaly-panel-ui-cleanup-v1`.
2. Abrir `/admin/conversations`.
3. Confirmar header limpio con logo, navegacion y `Web Maternaly`.
4. Confirmar que `Estado tecnico` aparece cerrado.
5. Confirmar que el sidebar no deja hueco muerto antes de las conversaciones.
6. Confirmar que el composer no muestra video mock ni texto sandbox.

## Seguridad

No se han usado datos reales, no se han impreso secretos y no se ha escrito en Sheets reales.
