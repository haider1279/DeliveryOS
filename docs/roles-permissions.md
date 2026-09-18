# Roles & Permissions Matrix — DeliveryOS

## 1. System Roles
DeliveryOS supports 6 distinct roles:
1. `SUPER_ADMIN`: Root administrator with full operational and system settings access.
2. `ADMIN`: Agency operational manager (organization, project, user, and financial access).
3. `PROJECT_MANAGER`: End-to-end management of assigned projects (requirements, estimates, tasks, releases, client liaison).
4. `DEVELOPER`: Delivery team member assigned to specific projects; manages assigned tasks, logs time, fixes bugs.
5. `QA`: Quality assurance engineer; creates test cases, executes test runs, manages bugs, handles retests.
6. `CLIENT`: External client contact strictly isolated to their organization's projects, requirements, approvals, reviews, and invoices.

## 2. Permissions Matrix

| Resource / Capability | SUPER_ADMIN | ADMIN | PROJECT_MANAGER | DEVELOPER | QA | CLIENT |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| System Settings | Yes | Read-only | No | No | No | No |
| Audit Logs | Yes | Yes | No | No | No | No |
| User Management | Full | Full | View Project Team | View Assigned | View Assigned | No |
| Organization Management | Full | Full | Read Assigned | No | No | Self Only |
| Project Creation | Yes | Yes | Yes | No | No | No |
| Project Workspace | Full | Full | Assigned | Assigned | Assigned | Portal View (Self) |
| Requirement Submission | Yes | Yes | Yes | No | No | Yes (Draft/Submit) |
| Estimate Creation/Editing | Yes | Yes | Yes | No | No | No |
| Estimate Approval | No | No | No | No | No | Yes (Own Org) |
| Task Assignment | Yes | Yes | Yes | Self/Project | No | No |
| Time Logging | Yes | Yes | Yes | Yes | Yes | No |
| Test Case / Test Run | Yes | Yes | Yes | View | Yes | No |
| Bug Lifecycle Management | Yes | Yes | Yes | Fix/Comment | Full QA | Portal Feedback |
| Client Review Decisions | No | No | No | No | No | Yes (Own Org) |
| Release Deployment | Yes | Yes | Yes | View | View | View Deployed |
| Invoice Creation / Void | Yes | Yes | Yes (Assigned) | No | No | No |
| Payment Recording | Yes | Yes | Yes (Assigned) | No | No | View Receipts |
| Internal Cost / Margin | Yes | Yes | Yes (Assigned) | No | No | No (Hard Forbidden) |
| Internal Comments | Yes | Yes | Yes | Yes | Yes | No (Filtered at DB) |

## 3. Enforcement Guarantee
- All rules are enforced in the Node.js API middleware.
- Client requests filter with `WHERE organizationId = :userOrgId` at the database query level.
- Any attempt to access cross-tenant resources returns `404 Not Found` to prevent entity enumeration.
