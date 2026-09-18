# Testing Strategy — DeliveryOS

## Overview
DeliveryOS incorporates a multi-tier testing strategy:
1. **Unit Tests**: State machines, project health calculations, invoice status recomputation, role validators.
2. **Integration / API Tests**: Express endpoint validations, error envelopes, and Prisma transactions.
3. **Security / IDOR Matrix**: Strict enforcement of the 13 tenant-isolation checks specified in Section 13.1.
4. **End-to-End Workflow**: Simulation of the full 34-step delivery lifecycle scenario.

## Running Tests

```bash
# Run backend test suite
npm run test:backend

# Run tests with coverage
npm run test:backend -- --coverage
```

## Security / IDOR Test Matrix Coverage
- Client A accessing Client B project -> returns 404 (prevents entity enumeration).
- Client A accessing Client B invoice -> returns 404.
- Client A attempting to view internal comments or margins -> returns 403 or filtered out.
- Developer attempting to access billing/invoices -> returns 403.
- Forged `userId` or `role` in request body -> ignored; identity derived strictly from session.
- Stale requirement version approval attempt -> rejected with 409 Conflict.
- Duplicate payment recording attempt -> rejected with duplicate transaction prevention.
