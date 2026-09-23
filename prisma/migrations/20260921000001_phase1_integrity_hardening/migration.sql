-- Phase 1 integrity hardening
-- The @@unique([projectId, userId, leftAt]) constraint does NOT prevent two
-- active (leftAt IS NULL) membership rows because NULLs are considered
-- distinct in PostgreSQL. A partial unique index does.
-- (Estimate + RequirementApproval unique constraints are already created as
-- part of the 20260920000000_init baseline migration.)
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_active_key"
  ON "ProjectMember"("projectId", "userId")
  WHERE "leftAt" IS NULL;