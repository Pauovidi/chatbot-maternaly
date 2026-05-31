# Documentos de contexto

No se deben commitear documentos reales con datos sensibles. Colocarlos localmente en:

- `docs/import/`
- `local-data/imports/`
- `knowledge/imports/`

Documentos esperados:

- `Requisitos_Maternaly.pdf`
- `chatbot.pdf`
- `ACTIVIDADES FISICAS EMBARAZO DOCUMENTO 1 JOSE ANTONIO.docx`
- `Informacion para Agente de IA.docx`
- `Servicios Maternaly (whatsapp).docx`

Ingesta futura:

1. Extraer texto PDF/DOCX.
2. Dividir por servicio.
3. Clasificar informativo vs reservable.
4. Cruzar reservables contra Sheets.
5. Marcar ambiguedades para revision humana.

Preparacion al Parto queda con `requires_interview=true` hasta validar documento completo.
