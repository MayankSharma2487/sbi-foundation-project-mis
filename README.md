# SBI Foundation Project MIS

FastAPI + SQLAlchemy 2 + PostgreSQL backend and React + TypeScript + Vite + Tailwind frontend.
See CHECKLIST.md for exactly what is built and tested.

## Run locally (Docker)
    cp .env.example .env      # fill in POSTGRES_PASSWORD, SECRET_KEY, SUPERADMIN_*
    docker compose up --build
    # App:      http://localhost:8080   (nginx serves the UI and proxies /api to the backend)
    # API docs: http://localhost:8000/api/docs

## Run without Docker
    cd backend && pip install -r requirements.txt
    export DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/mis
    alembic upgrade head
    SUPERADMIN_EMAIL=you@org SUPERADMIN_PASSWORD='...' python -m app.seed [--demo]
    uvicorn app.main:app --reload

`--demo` loads clearly named SAMPLE data (SAMPLE State / District / Block / Village, users fc.a@sample.local and
fc.b@sample.local, password = SUPERADMIN_PASSWORD). It is refused when ENVIRONMENT=production.

## Frontend development
    cd frontend && npm install
    npm run dev            # http://localhost:5173, proxies /api to http://localhost:8000
    npm run build          # type-check + production build

## Tests
    cd backend && pytest                                  # SQLite, in memory
    TEST_DATABASE_URL=postgresql+psycopg://... pytest     # PostgreSQL (drops/recreates tables - use a scratch DB)

Frontend (needs the API running on a migrated, seeded database - run `python -m app.seed --demo` first, tests create
and clean up their own records but log in as the seeded admin and fc.a@sample.local):

    cd frontend
    VITE_API_URL=http://localhost:8000/api/v1 MIS_ADMIN_PASSWORD='<your SUPERADMIN_PASSWORD>' npx vitest run

Without VITE_API_URL the live-backend suites are skipped.

## Access model
A user has one or more assignments: role + optional project + optional geography (district / block / village).
Permission codes are `resource:action`; `pii:read` (unmasking Aadhaar/PAN/bank data) is separate and withheld from
Management Viewer and Field Coordinator by default. Geography access flows downward only. Role permissions are
editable via `PUT /api/v1/roles/{id}/permissions` (Super Admin role is fixed).

## ER diagram (Phase 1)
```mermaid
erDiagram
  states ||--o{ districts : has
  districts ||--o{ blocks : has
  blocks ||--o{ villages : has
  states ||--o{ projects : hosts
  projects ||--o{ project_locations : covers
  districts ||--o{ project_locations : in
  users ||--o{ user_assignments : has
  roles ||--o{ user_assignments : grants
  projects ||--o{ user_assignments : limits
  roles }o--o{ permissions : role_permissions
```
