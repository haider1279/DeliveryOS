# Workflows & State Machines — DeliveryOS

## 1. Requirement Lifecycle State Machine

```
[DRAFT]
   │ (Client submitter or PM)
   ▼
[SUBMITTED]
   │
   ├────────► [NEEDS_CLARIFICATION] ───► [UNDER_REVIEW]
   ▼
[UNDER_REVIEW]
   │ (PM reviews details)
   ▼
[ESTIMATING]
   │ (PM generates estimate & sends)
   ▼
[WAITING_FOR_APPROVAL]
   │
   ├─► [REJECTED]
   ├─► [NEEDS_CLARIFICATION]
   ▼ (Client Approves)
[APPROVED]
   │ (PM spawns tasks)
   ▼
[IN_DEVELOPMENT]
   │ (Tasks marked READY_FOR_QA)
   ▼
[QA]
   │
   ├─► [IN_DEVELOPMENT] (QA test run fails -> bug spawned)
   ▼ (QA tests pass)
[CLIENT_REVIEW]
   │
   ├─► [IN_DEVELOPMENT] (Client requests changes)
   ▼ (Client approves)
[COMPLETED]
```

### Transition Map & Server Validation
The backend transition map is strictly enforced by `RequirementService.transitionStatus()`:
- `DRAFT -> SUBMITTED` (Author/PM/Client)
- `SUBMITTED -> UNDER_REVIEW | NEEDS_CLARIFICATION` (PM/Admin)
- `UNDER_REVIEW -> ESTIMATING | NEEDS_CLARIFICATION` (PM/Admin)
- `NEEDS_CLARIFICATION -> UNDER_REVIEW` (Submitter/Client)
- `ESTIMATING -> WAITING_FOR_APPROVAL` (PM/Admin upon sending estimate)
- `WAITING_FOR_APPROVAL -> APPROVED | REJECTED | NEEDS_CLARIFICATION` (Client)
- `APPROVED -> IN_DEVELOPMENT` (PM/Admin)
- `IN_DEVELOPMENT -> QA` (Developer/PM)
- `QA -> IN_DEVELOPMENT | CLIENT_REVIEW` (QA/PM)
- `CLIENT_REVIEW -> COMPLETED | IN_DEVELOPMENT` (Client)
- `* -> CANCELLED` (PM/Admin only)

## 2. Bug Lifecycle State Machine
```
[OPEN] -> [TRIAGED] -> [IN_PROGRESS] -> [FIXED] -> [READY_FOR_RETEST] -> [CLOSED]
                                                                     └──> [REOPENED] -> [IN_PROGRESS]
```

## 3. Invoice Lifecycle & Authoritative Status Recomputation
Invoices do not have arbitrary manual status edits. Status is calculated authoritatively from the sum of verified `Payment` records:
- Total Payments == 0 and Not Sent: `DRAFT`
- Issued and Total Payments == 0: `ISSUED`
- Issued and 0 < Total Payments < Total Amount: `PARTIALLY_PAID`
- Total Payments >= Total Amount: `PAID`
- Issued and Due Date Past and Total Payments < Total Amount: `OVERDUE`
- Cancelled: `VOID`

## 4. Project Health Deterministic Calculation Formula
A project's health is derived deterministically from live signals:
- **DELAYED**: Current date > `targetDate` and status NOT in (`COMPLETED`, `CANCELLED`). Reason: *"Project is past target completion date."*
- **BLOCKED**: At least one open `Task` with `status = 'BLOCKED'`. Reason: *"One or more active tasks are marked blocked."*
- **AT_RISK**: Any of:
  1. >= 3 overdue tasks (`dueDate < now` and status not `DONE` or `CANCELLED`). Reason: *"{N} tasks are overdue."*
  2. >= 1 open bug with severity `CRITICAL`. Reason: *"{N} critical bug(s) open."*
  3. Client approval pending > 2 business days. Reason: *"Client approval has been pending for over 2 days."*
  4. Target date within 7 days and completed tasks < 70%. Reason: *"Deadline within 7 days with significant work remaining."*
- **ON_TRACK**: None of the above apply.

## 5. Project Progress Calculation Formula
`Progress % = (Completed Eligible Requirements + Completed Eligible Tasks) / (Total Eligible Requirements + Total Eligible Tasks) * 100`
- Excludes items with status `CANCELLED`.
- If no requirements or tasks exist yet, return `null` ("No delivery progress yet"), rather than a misleading 0%.
