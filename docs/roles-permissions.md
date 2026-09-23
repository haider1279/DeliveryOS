# Roles & Permissions Matrix — DeliveryOS

## 1. System Roles
DeliveryOS supports 7 distinct roles:
1. `SUPER_ADMIN`: Root administrator with full operational, billing, and system settings access.
2. `ADMIN`: Agency operational manager (organization, project, user, and financial access).
3. `BD` (Business Development): Client acquisition manager; owns lead prospecting, CRM, and qualification of prospective client organizations into approved clients.
4. `PROJECT_MANAGER`: End-to-end management of assigned projects (requirements, estimates, tasks, releases, client liaison, billing).
5. `DEVELOPER`: Delivery team member assigned to specific projects; manages assigned tasks, logs time, fixes bugs.
6. `QA`: Quality assurance engineer; creates test cases, executes test runs, manages bugs, handles retests and verifications.
7. `CLIENT`: External client contact strictly isolated to their organization's projects, requirements, approvals, reviews, and invoices.

## 2. Permissions Matrix

| Resource / Capability | SUPER_ADMIN | ADMIN | BD | PROJECT_MANAGER | DEVELOPER | QA | CLIENT |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| System Settings | Yes | Read-only | No | No | No | No | No |
| Audit Logs | Yes | Yes | No | No | No | No | No |
| User Management | Full | Full | No | View Project Team | View Assigned | View Assigned | No |
| Lead / Prospecting (CRM) | Full | Full | Full | No | No | No | No |
| Org Qualification | Full | Full | Full | No | No | No | No |
| Organization Management | Full | Full | Create/Qualify | Read Assigned | No | No | Self Only |
| Project Creation | Yes | Yes | No | Yes (Approved Orgs) | No | No | No |
| Project Workspace | Full | Full | No | Assigned | Assigned | Assigned | Portal View (Self) |
| Requirement Submission | Yes | Yes | No | Yes | No | No | Yes (Draft/Submit) |
| Estimate Creation/Editing | Yes | Yes | No | Yes | No | No | No |
| Estimate Approval | No | No | No | No | No | No | Yes (Own Org) |
| Task Assignment | Yes | Yes | No | Yes | Self/Project | No | No |
| Time Logging | Yes | Yes | No | Yes | Yes | Yes | No |
| Test Case / Test Run | Yes | Yes | No | Yes | View | Yes | No |
| Bug Lifecycle Management | Yes | Yes | No | Yes | Fix/Comment | Full QA | Portal Feedback |
| Client Review Decisions | No | No | No | No | No | No | Yes (Own Org) |
| Release Deployment | Yes | Yes | No | Yes | View | View | View Deployed |
| Invoice Creation / Void | Yes | Yes | No | Yes (Assigned) | No | No | No |
| Payment Recording | Yes | Yes | No | Yes (Assigned) | No | No | View Receipts |
| Internal Cost / Margin | Yes | Yes | No | Yes (Assigned) | No | No | No (Hard Forbidden) |
| Internal Comments | Yes | Yes | No | Yes | Yes | Yes | No (Filtered at DB) |

## 3. Enforcement Guarantee
- All rules are enforced in the Node.js API middleware and domain services.
- Client requests filter with `WHERE organizationId = :userOrgId` at the database query level.
- Staff requests enforce project membership checks (`requireProjectAccess`) before returning workspace data.
- Any attempt to access cross-tenant or unauthorized resources returns `404 Not Found` (or `403 Forbidden` where appropriate) to prevent entity enumeration.
