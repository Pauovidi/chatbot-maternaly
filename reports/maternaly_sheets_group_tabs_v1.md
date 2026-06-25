# Maternaly Sheets Group Tabs v1

## Business Request

Crear vistas generadas por grupo-horario en los Google Sheets normalizados de Maternaly para facilitar la revision operativa de inscripciones por grupo, manteniendo `Inscripciones` como fuente de verdad.

## Technical Decision

- Se añade `scripts/maternaly-sheets-sync-group-tabs.mjs` como script Node puro, ejecutado con `node` y no con `tsx`.
- El script lee `Grupos_Ediciones`, `Sesiones`, `Inscripciones` y, si existe, `Clientes_Local`.
- La agrupacion se hace por `grupo_id`; no se escribe ni se corrige la pestana `Inscripciones`.
- Cada vista generada se crea o actualiza en una pestana gestionada cuyo titulo empieza por el prefijo configurable, por defecto `GRP `.

## Naming And Sorting

- Pilates se nombra por servicio, centro y hora, por ejemplo `GRP Pilates Bilbao 10`, `GRP Pilates Bilbao 11` y `GRP Pilates Erandio 13`.
- BLW y charla se nombran por servicio, centro y fecha, por ejemplo `GRP BLW Erandio 2026-09-02` o `GRP Charla Erandio 2026-09-24`.
- Los nombres se sanean para quitar caracteres no validos en tabs de Google Sheets y se limitan a longitud estable.
- En caso de colision, se añade un sufijo derivado de `grupo_id`.
- Pilates se ordena por centro, dia, hora y nombre de grupo. BLW/charla se ordenan por fecha, hora, centro y grupo.

## Update Rules

- El script solo gestiona tabs que empiezan por el prefijo configurado.
- Si la tab existe, se limpia y se reescribe completa.
- Si la tab no existe, se crea.
- No se eliminan tabs manuales ni tabs sin prefijo.
- No se eliminan tabs antiguas por defecto.

## Runtime Flags

- `MATERNALY_GROUP_TABS_SYNC_ENABLED=true`
- `MATERNALY_GROUP_TABS_SYNC_MODE=dry_run|live`
- `MATERNALY_GROUP_TABS_SYNC_ALLOW_WRITE=true`
- `MATERNALY_GROUP_TABS_PREFIX=GRP `
- `MATERNALY_GROUP_TABS_INCLUDE_EMPTY=true|false`

El modo live solo escribe si `MATERNALY_GROUP_TABS_SYNC_MODE=live`, `MATERNALY_GROUP_TABS_SYNC_ENABLED=true`, `MATERNALY_GROUP_TABS_SYNC_ALLOW_WRITE=true`, hay credenciales de Google y hay IDs de Sheets configurados.

## Testing

- Tests de agrupacion por `grupo_id`.
- Tests para mantener separados Pilates 10/11/13.
- Tests para BLW por fecha y sede.
- Tests para incluir o excluir grupos vacios por flag.
- Tests para no modificar `Inscripciones`.
- Tests para no tocar tabs sin prefijo.
- Tests para dry-run sin llamadas de escritura.
- Tests para live falso con create/update/formato.
- Tests de saneado de nombres y colisiones.
- Tests de redaccion de IDs de Sheets en reportes.

## Client Warning

Las pestanas `GRP ...` son vistas generadas automaticamente. El equipo debe editar `Inscripciones` como fuente de verdad y no las vistas generadas.
