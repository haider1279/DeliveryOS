# Architecture Overview — DeliveryOS

## 1. System Topology
DeliveryOS is architected as a modular monolith:
- **Client Layer**: React (Vite) Single Page Application serving two separate user experiences:
  1. Internal Operating System (`/app/*`) for agency staff (`SUPER_ADMIN`, `ADMIN`, `PROJECT_MANAGER`, `DEVELOPER`, `QA`).
  2. Premium Client Portal (`/portal/*`) for client company contacts (`CLIENT`).
- **API Layer**: Node.js + Express + TypeScript enforcing strict layered flow:
  `Route -> Auth Middleware -> RBAC / Isolation -> Zod Validation -> Controller -> Service -> Repository (Prisma)`.
- **Data Layer**: PostgreSQL managed via Prisma ORM with strict referential integrity, indexes, soft-deletes, and Decimal financial fields.
- **Identity & Storage Layer**: Supabase Auth (JWT authentication) and Supabase Storage (private buckets with signed URLs).

## 2. Directory Layout
```
/
  docs/               Architecture, APIs, workflows, and operations documentation
  prisma/             Prisma schema, migrations, and realistic seed script
  shared/             Shared TypeScript types, enums, and Zod schemas
  backend/            Express API application
    src/
      config/         Environment configuration and database clients
      middleware/     Auth, RBAC, tenant isolation, Zod validation, error handler
      modules/        Domain logic (requirements, tasks, bugs, invoices, etc.)
      routes/         API routing
      services/       Authoritative business logic & transactions
      repositories/   Prisma query layer
      jobs/           Scheduled background tasks (overdue tasks, invoice checks)
  frontend/           Vite React client application
    src/
      api/            Type-safe API client functions
      auth/           Auth context and UX-level route guards
      components/     Shared UI component library
      features/       Domain-scoped UI features
      layouts/        InternalLayout and ClientPortalLayout
      pages/          Route entrypoints
```

## 3. Communication & State Flow
- **Client -> Server**: REST API over HTTPS using JSON request/response envelopes.
- **Server Data Fetching**: TanStack Query (React Query) with deterministic cache invalidation upon mutation.
- **Transactions**: All multi-step workflow actions are bound within single Prisma `$transaction` blocks ensuring atomic commits and zero orphaned records.
