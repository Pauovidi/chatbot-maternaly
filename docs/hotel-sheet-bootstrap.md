# Bootstrap de Google Sheets desde el Excel real

La fuente de verdad para la operativa ya no es un layout inventado. El bootstrap parte del workbook real del cliente:

`D:\- TOT EL DEMES\TREBALLS\FEINA ACTUAL\Reddia\somos perros\Copia de FPO1-04 RESERVAS BUENO.xlsx`

## Qué se ha interpretado del Excel real

- El workbook tiene `104` pestañas.
- Hay `97` hojas mensuales históricas y futuras.
- Las hojas resumen/reporte detectadas son:
  - `NIVEL DE OCUPACIÓN`
  - `RECHAZADOS 2019`
  - `RECHAZADOS 2021`
  - `RECHAZADOS 2022`
  - `Rechazados 2024`
  - `Rechazados 2025`
- El patrón mensual moderno dominante es el de `2026`:
  - cabecera de días en la fila `3`
  - días en `B:AF`
  - bloque de datos en `A4:AF39`
  - `HAB 1` a `HAB 16` ocupando bloques de 2 filas
  - filas adicionales `COCINA` y `ENTRADA`
  - resumen/fórmulas en `40:44`
  - leyenda visual en `46:52`
  - rango operativo completo leído para validación: `A1:AG52`

## Colores operativos detectados

- `#92D050`: `Sociable`
- `#FFC000`: `No comparte`
- `#FF0000`: `No sociable`
- `#00B0F0`: `Nuevo`
- `#FFFF00`: `Antiguo (no se recuerda carácter)`
- `#7030A0`: `Escuela de dia`

## Qué se replica exacto

- Las pestañas reales del workbook.
- Los nombres reales de hoja, incluyendo espacios irregulares históricos cuando existen.
- Valores, fórmulas, merges y gran parte del formato visual.
- La leyenda operativa y los colores del Excel real.

## Qué se aproxima

- Google Sheets no promete fidelidad perfecta al importar todos los metadatos de Excel.
- Algunas hojas históricas de `RECHAZADOS` arrastran rarezas de rango/formatos heredadas del propio `.xlsx`.
- La operativa de disponibilidad del sistema se adapta al grid diario real del Excel.
  - El workbook no separa mañana/tarde por columnas en el layout mensual real.
  - La lógica automática se mantiene conservadora cuando una misma fecha mezcla entrada/salida el mismo día.

## Decisión de migración

El bootstrap usa conversión nativa de Google Drive de `xlsx -> Google Spreadsheet`, pero la creación ya no se hace con service account como propietaria.

Motivo:

- es la vía más fiel para preservar el contrato visual real del cliente
- evita reconstruir a mano un layout alternativo
- conserva mejor fórmulas, merges, bordes, anchos y distribución histórica
- la propiedad del archivo queda en el Drive del usuario humano autenticado por OAuth
- después de crear el spreadsheet, el script lo comparte con la service account para runtime

## Incidencia corregida en OAuth

La evidencia operativa confirmaba que el navegador llegaba bien hasta el callback local:

- Google mostraba consentimiento
- el usuario aceptaba
- Google volvía a `127.0.0.1`
- el servidor local respondía `Autorización completada`

Por tanto, el fallo real no estaba en Google Cloud, en el redirect ni en el test user. El punto roto era el intercambio final `authorization_code -> access/refresh token`.

La solución aplicada en el bootstrap es:

- usar el flujo oficial de `googleapis/google-auth-library`
- crear `new google.auth.OAuth2(clientId, clientSecret, redirectUri)`
- generar la URL con `oauth2Client.generateAuthUrl(...)`
- intercambiar el código con `await oauth2Client.getToken({ code, redirect_uri })`
- persistir el token localmente solo después de un exchange correcto

Además, el script ahora deja trazabilidad saneada:

- `oauth client id` enmascarado
- `redirect uri` detectado
- recepción del callback y del `code`
- inicio del token exchange
- `status` y `body` reales del error del token endpoint cuando Google responde error
- sin imprimir `client_secret`, `refresh_token` ni claves privadas

## Comando

```bash
npm run hotel:sheet:init
```

## Credenciales de bootstrap OAuth

Obligatorias para `npm run hotel:sheet:init`:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_OAUTH_TOKEN_PATH`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`

Opcionales para bootstrap:

- `SHEET_SHARE_WITH`
  - si no se informa, el script comparte por defecto con `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SPREADSHEET_TITLE`
- `HOTEL_GOOGLE_SHEETS_BOOTSTRAP_TITLE`
- `HOTEL_SHEET_BOOTSTRAP_SOURCE_XLSX`
- `HOTEL_SOURCE_EXCEL_PATH`
- `GOOGLE_PROJECT_ID`

## Credenciales de runtime con service account

Para que la app siga leyendo/escribiendo el spreadsheet ya creado:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_PROJECT_ID`
- `HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID`

Opcional:

- `HOTEL_GOOGLE_SHEETS_CONTRACT_JSON`
  - si quieres inyectar el contrato derivado sin depender del default del repo

## Salida del script

El comando imprime:

- `spreadsheetId`
- `spreadsheetUrl`
- `HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID=...`
- la ruta del token OAuth persistido
- el email con el que se ha compartido el archivo

Esa es la variable que debes guardar después para conectar el adapter real del sistema.

## Integración con el sistema

El adapter de Sheets queda alineado con el contrato mensual real del workbook:

- resuelve hojas como `AGOSTO 2026`, `SEPTIEMBRE 2026`, etc.
- valida cabecera real en fila `3`
- lee y escribe sobre filas `4:39`
- respeta el patrón real de habitaciones y colores
- usa el mapa de pestañas reales del workbook en lugar de asumir `yyyy-mm`

## Pasos exactos de ejecución local

1. Configura en Google Cloud un OAuth Client para app de escritorio o local app.
2. Añade un redirect local como `http://127.0.0.1:3017/oauth2callback`.
3. Exporta:
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_OAUTH_REDIRECT_URI`
   - `GOOGLE_OAUTH_TOKEN_PATH`
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
4. Ejecuta `npm run hotel:sheet:init`.
5. El script abre el navegador automáticamente.
6. Si el navegador no se abre, la URL completa queda guardada al lado del token, en un archivo `*.auth-url.txt`, para evitar depender de una URL cortada en terminal.
7. Autentícate con tu cuenta Google.
8. Tras el callback local, el script ejecuta el token exchange oficial con `OAuth2.getToken(...)`.
9. El script guardará el token en `GOOGLE_OAUTH_TOKEN_PATH`.
10. El spreadsheet se creará en tu Drive.
11. El script compartirá automáticamente el archivo con la service account.
12. Guarda `HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID`.
13. Para runtime, configura además `GOOGLE_PRIVATE_KEY` y activa `HOTEL_USE_GOOGLE_SHEETS_REAL=true`.

## Ejecución fiable del bootstrap OAuth

Lanza:

```bash
npm run hotel:sheet:init
```

Durante la ejecución verás, en este orden:

- validación explícita de `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` y `GOOGLE_OAUTH_REDIRECT_URI`
- `oauth client id` enmascarado
- `oauth redirect uri`
- apertura automática del navegador
- confirmación de callback local
- inicio del token exchange
- creación del spreadsheet
- compartición con `SHEET_SHARE_WITH` o `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- impresión final de `spreadsheetId`, URL y `HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID`

## Shared Drives

Existe una alternativa con Shared Drive para entornos donde no quieras depender de OAuth de usuario, pero no es el camino principal de esta versión. La vía principal aquí es:

- creación por OAuth de usuario humano
- compartición con la service account
- runtime posterior por service account sobre el spreadsheet ya creado

## Validación mínima añadida

- lectura e inspección del `.xlsx`
- detección de hojas mensuales y resumen
- creación/importación del spreadsheet en Google
- compartición automática con el email configurado
- lectura del layout real por el adapter
- escritura base sobre el grid mensual real
