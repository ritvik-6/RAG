# Database Setup (PostgreSQL + pgAdmin)

This guide details the PostgreSQL configuration, schema persistence behavior, and step-by-step instructions for connecting via pgAdmin 4 or the `psql` CLI.

## Container Configuration

The PostgreSQL database service (`db`) is configured in `docker-compose.yml`:

- **Image**: `postgres:16-alpine`
- **Container Name**: `my-postgres-db`
- **Port Mapping**: `5432:5432`
- **Credentials**:
  - `POSTGRES_USER`: `postgres`
  - `POSTGRES_PASSWORD`: `Admin`
  - `POSTGRES_DB`: `postgres`
- **Volumes**:
  - `pgdata:/var/lib/postgresql/data` (persistent data volume)
  - `./database/schema.sql:/docker-entrypoint-initdb.d/init.sql:ro` (initialization script)

## Schema Initialization & Updates

- **Automatic Run**: `database/schema.sql` automatically executes when the container is created for the first time on an empty `pgdata` volume.
- **Subsequent Restarts**: Schema initialization is skipped on subsequent container starts.
- **Applying Schema Changes**: Modifying `database/schema.sql` does not alter an existing database volume. To apply schema updates:
  - **Wipe and rebuild**: Run `docker compose down -v` followed by `docker compose up -d --build` (destroys all data).
  - **Manual Migration**: Run `python database/migrate.py` or execute scripts in `database/migrations/`.

## Connecting via pgAdmin 4

1. Launch pgAdmin 4, right-click **Servers** → **Register** → **Server...**
2. **General** tab: Enter `RAG Postgres` as the server name.
3. **Connection** tab:
   - **Host name/address**: `localhost`
   - **Port**: `5432`
   - **Maintenance database**: `postgres`
   - **Username**: `postgres`
   - **Password**: `Admin`
4. Click **Save**.
5. Navigate to **Databases** → **postgres** → **Schemas** → **public** → **Tables** to view `chat_sessions`, `chat_messages`, `documents`, and `thread_messages`.

## Connecting via CLI (`psql`)

```bash
psql -h localhost -p 5432 -U postgres -d postgres
```
