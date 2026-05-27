# Matriz QA Conversacional V0

Fecha: 2026-05-27  
Rama: `codex/smp-conversation-e2e-qa-v0`  
Datos: solo fixtures sinteticos. No contiene secretos ni PII real.

| # | Input | Intent esperado | Acción esperada | Respuesta esperada | Sheets | Registro entrada | Humano | Riesgo |
|---|---|---|---|---|---|---|---|---|
| 1 | Hola | greeting | Responder menu informativo | Saludo con temas disponibles | No | No | No | Bajo |
| 2 | Hola, quiero información | general_information | Responder menu informativo | Horarios, visitas, reservas, vacunas, comida, qué traer | No | No | No | Bajo |
| 3 | Me gustaría saber cómo funciona | general_information | Explicar opciones generales | Menu de temas, sin fallback humano | No | No | No | Bajo |
| 4 | ¿Qué tengo que llevar? | faq_what_to_bring | FAQ | Respuesta de qué traer | No | No | No | Bajo |
| 5 | ¿Puedo visitar el hotel? | faq_visits | FAQ | Respuesta de visitas | No | No | No | Bajo |
| 6 | ¿Qué vacunas necesita? | faq_vaccines | FAQ | Requisitos sanitarios | No | No | No | Medio |
| 7 | ¿Mandáis fotos o vídeos? | faq_photos_videos | FAQ | Respuesta segura de fotos/videos | No | No | No | Bajo |
| 8 | ¿Puedo llevar su comida? | faq_food | FAQ | Indicar comida/pienso | No | No | No | Bajo |
| 9 | Quiero reservar para Kira QA del 29 al 31 de diciembre de 2026 | availability_request | Pedir/revisar disponibilidad | No confirma ni escribe | No | No | No | Alto |
| 10 | Tengo un perro, se llama Kira QA | unknown/reservation_start | Pedir contexto o fechas | No confirma | No | No | No | Medio |
| 11 | Sí, confirma | reservation_confirm | No ejecutar sin propuesta revisada | Derivar a humano seguro | No | No | Sí | Alto |
| 12 | No, mejor no | unknown | Aclarar intención | Sin cambios | No | No | No | Bajo |
| 13 | ¿Hay hueco para dos perros? | availability_request | Pedir datos completos | No escribe | No | No | No | Medio |
| 14 | Quiero cancelar mi reserva | reservation_cancel | Pedir identificador/contexto | No cancela sin datos | No | No | Sí | Alto |
| 15 | Quiero cambiar la fecha | reservation_modify | Pedir datos y revisión | No modifica sin confirmación | No | No | Sí | Alto |
| 16 | Quiero modificar la salida | reservation_modify | Pedir datos y revisión | No modifica sin confirmación | No | No | Sí | Alto |
| 17 | Quiero cancelar la reserva res_smp_qa_conv_001 | reservation_cancel | Revisión humana | No cancela automaticamente | No | No | Sí | Alto |
| 18 | Cancelación sin reservationId y datos ambiguos | reservation_cancel | Pedir localización | No cancela | No | No | Sí | Alto |
| 19 | Quiero hablar con una persona | human_handoff | Cambiar a modo humano | Handoff amable | No | No | Sí | Bajo |
| 20 | Mensaje posterior en modo humano | human_mode_skip | Guardar inbound sin bot | Sin autorespuesta | No | No | Sí | Alto |
| 21 | ¿Ha comido? | stay_status_question | No inventar estado real | Revisión por equipo | No | No | Sí | Alto |
| 22 | ¿Ha llorado mucho? | stay_status_question | No inventar estado real | Revisión por equipo | No | No | Sí | Alto |
| 23 | ¿Está jugando? | stay_status_question | No inventar estado real | Revisión por equipo | No | No | Sí | Alto |
| 24 | ¿Está bien mi perro? | stay_status_question | No inventar estado real | Revisión por equipo | No | No | Sí | Alto |
| 25 | Teléfono desconocido | client_unknown | Mantener nuevo contacto | Badge nuevo contacto | No | No | No | Medio |
| 26 | Cliente conocido fixture | client_known | Mantener bot salvo intención sensible | Evento client_directory_match | No | No | No | Medio |
| 27 | Cliente bloqueado fixture | client_blocked | Pasar a humano | Evento client_directory_blocked | No | No | Sí | Alto |
| 28 | Teléfono duplicado/ambiguous fixture | client_ambiguous | Marcar revisión manual | Evento client_directory_ambiguous | No | No | No/Sí según intención | Alto |
| 29 | Mensaje ambiguo | unknown | Pedir aclaración | Info/disponibilidad/persona | No | No | No | Bajo |
| 30 | Mensaje fuera de dominio | unknown | Pedir aclaración | Sin inventar | No | No | No | Medio |

## Reglas validadas

- El bot no debe inventar estado real del perro.
- El bot no debe confirmar, cancelar ni modificar reservas sin contexto valido y confirmación segura.
- Un cliente bloqueado pasa a modo humano.
- El modo humano bloquea la autorespuesta.
- Las pruebas con Google Sheets real solo deben usar datos sinteticos y rutas que validen el flujo real; en V0 no hay puente WhatsApp -> Sheets.
