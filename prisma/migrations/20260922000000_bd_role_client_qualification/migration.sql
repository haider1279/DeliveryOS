-- Add the BD (business development) role to the authoritative role enum.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'BD';

-- Business-development client-acquisition qualification lifecycle.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrganizationQualificationStatus') THEN
    CREATE TYPE "OrganizationQualificationStatus" AS ENUM ('PROSPECT', 'APPROVED', 'REJECTED');
  END IF;
END $$;

-- Qualification fields are owned by the BD role. Existing organizations default
-- to APPROVED so already-onboarded tenants keep behaving exactly as before.
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "qualificationStatus" "OrganizationQualificationStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS "qualificationNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "qualifiedById" TEXT,
  ADD COLUMN IF NOT EXISTS "qualifiedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Organization_qualificationStatus_idx"
  ON "Organization"("qualificationStatus");