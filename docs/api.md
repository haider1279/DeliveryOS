# API Reference — DeliveryOS

## Standard Envelopes

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 120
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "Cannot transition requirement from DRAFT directly to APPROVED"
  }
}
```

## Standard Error Codes
- `VALIDATION_ERROR`: Zod schema validation failed.
- `UNAUTHORIZED`: Invalid or missing Bearer token.
- `FORBIDDEN`: Valid token, but role or tenant boundary forbids the action.
- `NOT_FOUND`: Resource does not exist or belongs to another tenant.
- `CONFLICT`: Concurrency conflict or stale version approval attempt.
- `INVALID_STATE_TRANSITION`: State change violates the workflow transition map.
- `RATE_LIMITED`: Exceeded permitted request frequency.
- `INTERNAL_ERROR`: Unexpected server exception.

## Core Endpoints
- `POST /api/auth/login` - Authenticate via Supabase Auth
- `GET /api/auth/me` - Fetch verified profile, roles, and accessible org/projects
- `GET /api/organizations` - Organization list (Admin)
- `GET /api/projects` - Project list (filtered by role and tenant)
- `GET /api/projects/:id` - Full workspace bundle
- `GET /api/projects/:id/health` - Project health calculation and reason list
- `GET /api/requirements` - Requirements list
- `POST /api/requirements` - Create requirement
- `POST /api/requirements/:id/transition` - Workflow transition
- `POST /api/requirements/:id/estimates` - Create estimate
- `POST /api/requirements/:id/approvals` - Client approve/reject (version checked)
- `GET /api/tasks` - Tasks list
- `POST /api/tasks` - Create task
- `GET /api/tasks/my-work` - Developer assigned / overdue / blocked workspace
- `POST /api/time-entries` - Log time on a task
- `GET /api/test-cases` - QA test repository
- `POST /api/test-runs` - Execute test run (auto-creates bug on failure)
- `GET /api/bugs` - Bug tracker list
- `POST /api/bugs/:id/status` - Transition bug state (retest loop)
- `GET /api/releases` - Releases list
- `POST /api/releases` - Create release with linked items
- `GET /api/invoices` - Invoice list
- `POST /api/invoices` - Create draft invoice
- `POST /api/payments` - Record payment (auto-recomputes invoice status)
- `GET /api/reports/dashboard` - Role-customized metrics and charts
- `GET /api/notifications` - In-app notifications
- `GET /api/search` - Cross-entity search (RBAC-filtered)
- `GET /api/health` - Liveness check
