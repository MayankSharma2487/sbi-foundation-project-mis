# SBI Foundation Project MIS - Build Checklist

Legend: [x] built AND tested | [ ] not started | [~] partial (see note)

## Phase 1 - Backend foundation (done, 24 backend tests)
- [x] Models/migration 0001 (geography, projects, users, roles, permissions, assignments, audit) - applied to PostgreSQL 16,
      `alembic check` clean, downgrade/upgrade round trip OK
- [x] JWT auth (login/refresh/me/change-password), bcrypt, lockout, token invalidation
- [x] RBAC: 9 roles / 170 permissions, editable; project + district/block/village scoping
- [x] Geography, project, user/assignment, role/permission and audit-log APIs; seed (+ `--demo` SAMPLE data)
- [x] Dashboard summary API: live scoped counts, district/block/village filters

## Phase 1b - Frontend (done; React 18 + TS + Vite + Tailwind + shadcn-style components)
- [x] Login, responsive shell (sidebar, top bar, breadcrumb, mobile drawer), permission-aware navigation
- [x] Dashboard (live KPIs + charts, district/block/village filters)
- [x] Projects (list/create/edit/archive, district coverage)
- [x] Locations (state/district/block/village: search, filter, pagination, create/edit/archive)
- [x] Users (search, create, edit, deactivate, password reset, access assignments)
- [x] Roles & Permissions matrix editor (Super Admin locked)
- [x] Audit Logs (filters, pagination); Profile & Settings (account, change password)
- [x] Tests: `tsc` clean, production build OK, 9 API-client tests + 8 rendered-UI tests (jsdom) against live backend on PostgreSQL
- [~] Verified in jsdom, NOT in a real browser (none available here): layout/visual QA and mobile rendering are unchecked
- [~] Dashboard date-range / financial-year filters not built: Phase 1 data has no dated activity to filter yet
- [~] Tokens are kept in sessionStorage (XSS trade-off); httpOnly cookie sessions would be stronger
- [ ] Docker images (backend + frontend/nginx) written but never built or run (no Docker in this environment)

## Phase 2+ - Operational modules: NOT STARTED
Artisan Master, Mobilisation, Members, SHGs, Assessment, Trainings, Sampling, Products, Marketing, Buyers, Revenue,
Budget, Expenses, Advances, Payments, Governance, Shares, Staff, Activities, Challenges; programme dashboard KPIs;
reports; Excel import/export; field encryption, file storage, backups.
Sidebar deliberately lists only screens that work.

## Blocked on input
- The Excel screenshots have not arrived in this chat (three attempts; upload folder empty each time). Field names exist
  only as text in your prompt. Exact template reproduction (column order, dropdown values, fixed-format rules, formulas,
  images) cannot be done without the screenshots.
