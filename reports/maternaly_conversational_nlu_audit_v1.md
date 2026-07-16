# Auditoría conversacional y NLU de Maternaly v1

Fecha: 2026-07-16

## Verificación del repositorio

- Ruta: `D:\PAU OVIDI MM\Documents\Chatbot Maternaly Clean`
- Remoto: `https://github.com/Pauovidi/chatbot-maternaly.git`
- Rama de trabajo: `codex/maternaly-conversational-audit-v1`
- Base: `codex/maternaly-service-media-v1`
- No se utilizó el repositorio antiguo `Chatbot Maternaly`.
- Los informes históricos no versionados del working tree no se modificaron.

## Fuentes revisadas

- `charla informativa completo.docx`
- `TALLER BLW.docx`
- `Servicios Maternaly (whatsapp).docx`
- `Información para Agente de IA.docx`
- Catálogo de conocimiento, intérprete NLU, reducer, política, renderer, flujos normalizados, handoff clínico, media de servicios y tests existentes.

## Hallazgos principales

### 1. El NLU declaraba contexto multi-turno, pero no lo recibía

El prompt indicaba que debía mantener el contexto, pero la llamada a OpenAI solo enviaba el mensaje actual. Preguntas como `¿y qué incluye?`, `¿cuánto dura?`, `¿y en Bilbao?` o `cuéntame más` no tenían suficiente información para resolver el servicio anterior.

### 2. La herencia de contexto estaba limitada al precio

El core solo restauraba el servicio anterior cuando el foco era `pricing`. Duración, contenido, requisitos, beneficios, sede y continuaciones breves perdían el contexto.

### 3. Preguntas informativas podían activar una inscripción

Las reglas podían interpretar frases como `¿puedo ir con mi pareja?` como un dato de dos asistentes y entrar en el flujo de inscripción. También una pregunta corta sobre un servicio reservable podía tratarse como intención de reserva aunque preguntase por contenido o duración.

### 4. Charla y BLW no adaptaban la respuesta a la pregunta

Pilates ya tenía copy específico por foco, pero charla y BLW devolvían casi siempre el mismo bloque genérico. Faltaban respuestas separadas para contenido, duración, público, beneficios, precio, sedes y reserva.

### 5. La lectura de Responses API era demasiado estrecha

Solo se leía `output_text`. La respuesta REST también puede contener el texto dentro de `output[].content[]`, por lo que una respuesta válida podía caer innecesariamente al clasificador de respaldo.

### 6. Servicios activos e información histórica no estaban diferenciados en el prompt

El catálogo contiene más servicios informativos, pero los dos servicios con inscripción conectada son charla y BLW. El prompt ahora distingue ambos niveles para evitar que el modelo invente capacidades de reserva.

## Mejoras implementadas

- Contexto estructurado para el NLU:
  - servicio activo;
  - etapa del flujo;
  - sede y modalidad;
  - últimos seis mensajes;
  - redacción de teléfonos y emails en el historial reenviado.
- Paso explícito del `env` de cada ejecución al intérprete.
- Formato JSON Schema en Responses API.
- Lectura compatible con `output_text` y `output[].content[].text`.
- Nuevos focos:
  - `contents`;
  - `duration`;
  - `eligibility`.
- Herencia segura del servicio para:
  - precio;
  - horarios;
  - duración;
  - contenido;
  - requisitos;
  - beneficios;
  - ubicaciones;
  - continuaciones como `cuéntame más`.
- Resolución de `la otra` entre charla y BLW.
- Protección contra arrastre de contexto cuando hay un cambio claro de tema.
- Separación entre una pregunta sobre acompañante y el dato real de dos asistentes.
- Copy específico y basado en documentos para charla y BLW.
- Catálogo BLW ampliado con:
  - autorregulación;
  - requisitos para empezar;
  - introducción segura de alimentos;
  - alergias;
  - alimentación saludable.
- La duración del BLW se responde como 3 horas, de 17:00 a 20:00.
- La charla no inventa una duración: la fuente solo especifica horas de inicio.
- Se mantienen los guardrails de disponibilidad, pago, confirmación de plaza, privacidad y derivación clínica.

## Escenarios añadidos

- `¿De qué habláis en la charla informativa?`
- `¿Qué me aporta la charla de embarazo?`
- `¿Qué vale ir los dos al curso de alimentación del bebé?`
- `¿Cuántas horas son el taller BLW?`
- `Mi bebé tiene seis meses, ¿este taller BLW es para nosotros?`
- `¿y qué incluye?`
- `¿y cuánto dura?`
- `vale, dime más`
- `¿y en Bilbao?`
- `¿y la otra?`
- preguntas de pago, factura, privacidad y señales clínicas;
- pregunta elíptica sin contexto, que no debe inventar servicio.

## Validación

- Tests focalizados de conversación: 81 superados.
- Suite completa: 71 archivos, 526 tests superados, 1 pendiente.
- ESLint: correcto.
- Build de producción Next.js: correcto, incluida la comprobación TypeScript de producción.
- Autoridad Maternaly: correcta, 49 archivos comprobados.
- `git diff --check`: correcto.

El comando independiente `npx tsc --noEmit` sigue detectando errores previos en tests de scripts de Sheets no modificados por esta auditoría. El build de producción y la suite Vitest completa sí finalizan correctamente.

## Límites y seguridad

- No se hicieron envíos reales por WhatsApp.
- No se ejecutaron escrituras reales en Google Sheets.
- No se desplegó a producción.
- No se inventan fechas ni plazas: se consultan en el flujo normalizado.
- El fallback local continúa siendo determinista como red de seguridad. La interpretación principal con OpenAI usa el contexto real y salida estructurada; la variación visible sigue controlada por copy seguro para no comprometer información clínica, pagos o reservas.
