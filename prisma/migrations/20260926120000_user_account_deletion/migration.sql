-- ===========================================================================
-- True (physical) user-account deletion.
--
-- This migration makes a User row deletable WITHOUT destroying a single
-- historical business record. Every relation to User was reviewed
-- individually rather than cascade-wiping the graph:
--
--   1. Identity / non-historical child rows  -> keep ON DELETE CASCADE
--        Profile        (1:1 cosmetic data, worthless without the account)
--        ProjectMember  (an assignment row, not history; onLeave is the
--                        "left the project" signal, not a deleted account)
--        Notification   (personal inbox of the departing account)
--
--   2. Current-state assignments already nullable -> unchanged, already
--      ON DELETE SET NULL
--        Task.assigneeId, Bug.assigneeId, Requirement.requestedByUserId
--
--   3. Historical "who did this" actor references -> Relaxed from
--      NOT NULL/ON DELETE RESTRICT to NULL/ON DELETE SET NULL.
--      The row is business record and MUST survive; only the attribution
--      pointer clears:
--        Task.creatorId                  task history
--        TaskComment.authorId            task history
--        TimeEntry.userId                logged/billable hours (finance)
--        Requirement.submittedById      requirement history
--        RequirementVersion.createdById  requirement version history
--        RequirementStatusHistory.actorId status-transition history
--        Estimate.createdById            estimates + pricing history
--        RequirementApproval.decidedById contractual approval decision
--        TestCase.createdById            QA test-case history
--        TestRun.executedById            QA execution history
--        Bug.reporterId                  bug history
--        BugComment.authorId             bug history
--        ClientReview.reviewerId         contractual client sign-off
--        Release.createdById             release history
--        FileAsset.uploadedById          stored artefact is business record
--        ProjectRequest.requestedById    lead / BD pipeline history
--        ProjectActivity.actorId         project activity history feed
--        Payment.recordedById            FINANCIAL RECORD - never deleted
--        AuditLog.actorId                append-only audit trail
--
--   4. Live operational ownership -> deliberately LEFT AS ON DELETE RESTRICT
--        Project.projectManagerId
--      A project must always have an accountable manager, so deleting a PM who
--      still owns projects is refused by user-deletion.service.ts's pre-flight
--      check with an explicit error. That is preferable to silently orphaning
--      a project or auto-reassigning it behind the administrator's back.
--
-- Audit attribution: because the actor reference becomes NULL on deletion, the
-- actor identity is denormalised into an immutable AuditLog snapshot
-- (actorEmail / actorName / actorRole) at write time, so the audit trail stays
-- attributable after the account is gone. Existing rows are backfilled below.
-- ===========================================================================

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorId_fkey";
ALTER TABLE "Bug" DROP CONSTRAINT "Bug_reporterId_fkey";
ALTER TABLE "BugComment" DROP CONSTRAINT "BugComment_authorId_fkey";
ALTER TABLE "ClientReview" DROP CONSTRAINT "ClientReview_reviewerId_fkey";
ALTER TABLE "Estimate" DROP CONSTRAINT "Estimate_createdById_fkey";
ALTER TABLE "FileAsset" DROP CONSTRAINT "FileAsset_uploadedById_fkey";
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_recordedById_fkey";
ALTER TABLE "ProjectActivity" DROP CONSTRAINT "ProjectActivity_actorId_fkey";
ALTER TABLE "ProjectRequest" DROP CONSTRAINT "ProjectRequest_requestedById_fkey";
ALTER TABLE "Release" DROP CONSTRAINT "Release_createdById_fkey";
ALTER TABLE "Requirement" DROP CONSTRAINT "Requirement_submittedById_fkey";
ALTER TABLE "RequirementApproval" DROP CONSTRAINT "RequirementApproval_decidedById_fkey";
ALTER TABLE "RequirementStatusHistory" DROP CONSTRAINT "RequirementStatusHistory_actorId_fkey";
ALTER TABLE "RequirementVersion" DROP CONSTRAINT "RequirementVersion_createdById_fkey";
ALTER TABLE "Task" DROP CONSTRAINT "Task_creatorId_fkey";
ALTER TABLE "TaskComment" DROP CONSTRAINT "TaskComment_authorId_fkey";
ALTER TABLE "TestCase" DROP CONSTRAINT "TestCase_createdById_fkey";
ALTER TABLE "TestRun" DROP CONSTRAINT "TestRun_executedById_fkey";
ALTER TABLE "TimeEntry" DROP CONSTRAINT "TimeEntry_userId_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "actorEmail" TEXT,
ADD COLUMN "actorName" TEXT,
ADD COLUMN "actorRole" "UserRole",
ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "Bug" ALTER COLUMN "reporterId" DROP NOT NULL;
ALTER TABLE "BugComment" ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "ClientReview" ALTER COLUMN "reviewerId" DROP NOT NULL;
ALTER TABLE "Estimate" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "FileAsset" ALTER COLUMN "uploadedById" DROP NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "recordedById" DROP NOT NULL;
ALTER TABLE "ProjectActivity" ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "ProjectRequest" ALTER COLUMN "requestedById" DROP NOT NULL;
ALTER TABLE "Release" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "Requirement" ALTER COLUMN "submittedById" DROP NOT NULL;
ALTER TABLE "RequirementApproval" ALTER COLUMN "decidedById" DROP NOT NULL;
ALTER TABLE "RequirementStatusHistory" ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "RequirementVersion" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "creatorId" DROP NOT NULL;
ALTER TABLE "TaskComment" ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "TestCase" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "TestRun" ALTER COLUMN "executedById" DROP NOT NULL;
ALTER TABLE "TimeEntry" ALTER COLUMN "userId" DROP NOT NULL;

-- Backfill the immutable actor snapshot for audit rows written before this
-- migration, so pre-existing history is attributable too.
UPDATE "AuditLog" AS al
SET "actorEmail" = u."email",
    "actorRole" = u."role",
    "actorName" = NULLIF(
      BTRIM(COALESCE(p."displayName", '') || ' ' ||
           COALESCE(p."firstName", '') || ' ' || COALESCE(p."lastName", '')),
      ''
    )
FROM "User" AS u
LEFT JOIN "Profile" AS p ON p."userId" = u."id"
WHERE al."actorId" = u."id"
  AND (al."actorEmail" IS NULL OR al."actorRole" IS NULL);

-- AddForeignKey
ALTER TABLE "ProjectRequest" ADD CONSTRAINT "ProjectRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RequirementVersion" ADD CONSTRAINT "RequirementVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RequirementStatusHistory" ADD CONSTRAINT "RequirementStatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RequirementApproval" ADD CONSTRAINT "RequirementApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Bug" ADD CONSTRAINT "Bug_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BugComment" ADD CONSTRAINT "BugComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientReview" ADD CONSTRAINT "ClientReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Release" ADD CONSTRAINT "Release_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectActivity" ADD CONSTRAINT "ProjectActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
