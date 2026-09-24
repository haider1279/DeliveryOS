-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProjectRequestStatus') THEN
    CREATE TYPE "ProjectRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProjectRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "budget" DECIMAL(12,2),
    "targetDate" TIMESTAMP(3),
    "status" "ProjectRequestStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProjectRequest_organizationId_idx" ON "ProjectRequest"("organizationId");
CREATE INDEX IF NOT EXISTS "ProjectRequest_requestedById_idx" ON "ProjectRequest"("requestedById");
CREATE INDEX IF NOT EXISTS "ProjectRequest_status_idx" ON "ProjectRequest"("status");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProjectRequest_organizationId_fkey'
  ) THEN
    ALTER TABLE "ProjectRequest" ADD CONSTRAINT "ProjectRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProjectRequest_requestedById_fkey'
  ) THEN
    ALTER TABLE "ProjectRequest" ADD CONSTRAINT "ProjectRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
