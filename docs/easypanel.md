# EasyPanel

El proyecto hereda la preparacion de la base importada y queda orientado a Docker + Postgres.

Build:

```bash
docker build -t chatbot-maternaly:local .
```

Healthcheck:

```bash
GET /api/health
```

Devuelve, sin secretos:

- app ok
- database configured/provider
- ycloud configured true/false
- google sheets configured/access mode
- llm configured/provider
- environment
- commit/build info si existe

Migraciones:

- `db/migrations/001_init.sql`
- `db/migrations/002_conversations.sql`
- `db/migrations/003_operational_state.sql`
- `db/migrations/004_maternaly_operational_models.sql`
