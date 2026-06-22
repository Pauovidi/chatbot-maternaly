# Maternaly contextual contact data v1

## Estado

- Repo verificado: `D:\PAU OVIDI MM\Documents\Chatbot Maternaly Clean`
- Remote verificado: `https://github.com/Pauovidi/chatbot-maternaly.git`
- Rama de trabajo: `codex/maternaly-contextual-contact-data-v1`
- Base: `codex/maternaly-whatsapp-availability-critical-tabs-v1` (`1380115`)
- Escritura real en Sheets durante esta ejecucion: no
- Deploy/restart durante esta ejecucion: no

## Causa raiz

- El estado de registro no usaba `input.inbound.from` como telefono de contacto cuando `state.phone` estaba vacio.
- La extraccion de nombre dependia demasiado de prefijos como `soy` o `me llamo`, por lo que un mensaje por comas empezando por nombre podia quedar sin `fullName`.
- La fecha BLW solo se reconocia como `babyBirthDate` si el NLU veia palabras como `bebe` o `nacimiento`, ignorando que el flujo ya estaba en `collecting_contact`.
- En produccion, con OpenAI configurado, el arreglo no podia depender solo del mock NLU; hacia falta una capa determinista post-NLU y pre-missing-fields.

## Cambios

- Se anadio normalizacion segura de telefono de canal para formatos `whatsapp:+34...`, `+34...`, `34...` y telefono nacional sintetico de 9 digitos.
- El reducer de Maternaly enriquece slots tras el NLU con datos contextuales deterministas:
  - telefono operativo desde WhatsApp si existe;
  - email por regex;
  - nombre completo al inicio del mensaje en contexto de contacto;
  - `voy en pareja`, `somos dos`, `2 personas` como `peopleCount=2`;
  - `voy sola`, `1 persona`, `una persona` como `peopleCount=1`;
  - fecha contextual BLW como `babyBirthDate`;
  - fecha contextual Charla como `fppOrDueDate`.
- Si el mensaje trae un telefono distinto al de WhatsApp, el flujo conserva el telefono del canal y anota solo un marcador seguro: `telefono_mensaje_difiere_de_whatsapp`.
- Se emite `maternaly_registration_slots_enriched` con payload redacted: booleanos de deteccion, `dateMappedTo` y `missingFieldsAfter`, sin nombre/email/telefono completos.
- El write plan recibe el `phone` ya enriquecido desde el estado, por lo que `Clientes_Local.telefono_normalizado` e `Inscripciones.telefono` quedan alimentados por el telefono de WhatsApp si no hay otro contacto operativo valido.

## Tests anadidos

- BLW completo con telefono en `inbound.from` y mensaje sin telefono.
- BLW completo con telefono explicito diferente, manteniendo WhatsApp como contacto operativo.
- Caso por comas con nombre, telefono sintetico, email sintetico, pareja y fecha.
- Fecha suelta en `collecting_contact` mapeada a `babyBirthDate`.
- Guardrail: con telefono inferido no se vuelve a pedir `telefono`.
- Charla embarazo: fecha contextual mapeada a `fppOrDueDate`, no a `babyBirthDate`.

## Validacion local

- `npm.cmd run lint`: OK
- `npm.cmd run test:run -- src/lib/maternaly/conversation/normalized-service-flow.test.ts`: OK, 27 tests passed
- `npm.cmd run test:run`: OK, 64 files passed, 422 tests passed, 1 todo
- `npm.cmd run build`: OK
- `npm.cmd run maternaly:health`: OK local; entorno dry-run/local, sin credenciales live
- `npm.cmd run maternaly:sheets:live-write-test`: exit 0 con `skipped=true`, `reason=missing_required_live_flags`, `liveWriteAttempted=false`, `appendApplied=0`

## Como probar por WhatsApp

Secuencia:

```text
reiniciar
quiero reservar taller blw
3
PAU PRUEBAS, prueba.bot@example.test, voy en pareja, fecha 31/12/2026
```

Esperado:

- No pedir telefono si el canal WhatsApp ya aporta `from`.
- No volver a pedir nombre y apellidos.
- No volver a pedir fecha de nacimiento del bebe.
- Responder con solicitud/preinscripcion preparada y pendiente de validacion del equipo.
- No confirmar plaza pagada ni plaza cerrada.

## Dry-run seguro

Para volver o mantener dry-run, el entorno debe seguir sin habilitar la combinacion completa de flags live:

- `MATERNALY_ALLOW_SYNTHETIC_LIVE_WRITE=true`
- `MATERNALY_NORMALIZED_SHEETS_ENABLED=true`
- `MATERNALY_NORMALIZED_SHEETS_WRITE_MODE=live`
- `GOOGLE_SHEETS_ACCESS_MODE=live`
- `BOT_SHEETS_LIVE_WRITE_ENABLED=true`

Si falta alguno, el live-write test debe quedarse en skip seguro.
