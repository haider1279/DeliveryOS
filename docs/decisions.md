# Architectural Decision Records (ADR) — DeliveryOS

## ADR-001: Modular Monolith vs Microservices
- **Context**: Spec mandates high data integrity, transactional workflows (estimate approval -> task creation -> QA failure -> bug spawning), and avoiding unjustified infrastructure complexity.
- **Decision**: Built as a modular TypeScript monolith inside npm workspaces (`shared`, `backend`, `frontend`).
- **Consequences**: Enables strict ACID guarantees via Prisma `$transaction`, zero distributed state failure modes, straightforward local development, and simple single-container or serverless hosting.

## ADR-002: Dual Auth Verification Strategy
- **Context**: The app integrates Supabase Auth for production JWT verification, but must also run full automated integration tests without external network dependencies.
- **Decision**: Backend supports standard Supabase JWT validation, paired with a cryptographically verified development token mechanism for local CI/test suites.
- **Consequences**: Automated tests run fast, offline, and deterministically against test databases.

## ADR-003: Version-Pinned Approvals
- **Context**: Preventing race conditions where a requirement or estimate is modified while a client has an approval screen open.
- **Decision**: `RequirementApproval` records explicitly pin both `requirementVersion` and `estimateVersion`. If the server-side version has advanced, the approval is rejected with `CONFLICT` / `STALE_VERSION`.
- **Consequences**: Protects against unauthorized scope creep and stale price agreements.

## ADR-004: Decimal Representation for Currency
- **Context**: Financial calculations (invoices, payments, project profitability) suffer precision issues with standard floating-point numbers.
- **Decision**: All monetary fields use Prisma `Decimal` mapping to Postgres `DECIMAL(12,2)`.
- **Consequences**: Accurate financial accounting without floating-point rounding errors.
