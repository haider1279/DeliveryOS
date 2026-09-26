-- Link an approved ProjectRequest to the Project it creates, exactly once.
--
-- ProjectRequest.projectId is UNIQUE, which is the database-level guarantee that
-- approving a request can never produce a duplicate Project: a second approval
-- attempt collides here instead of silently creating another record.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ProjectRequest' AND column_name = 'projectId'
  ) THEN
    ALTER TABLE "ProjectRequest" ADD COLUMN "projectId" TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'ProjectRequest' AND indexname = 'ProjectRequest_projectId_key'
  ) THEN
    CREATE UNIQUE INDEX "ProjectRequest_projectId_key" ON "ProjectRequest"("projectId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProjectRequest_projectId_fkey'
  ) THEN
    ALTER TABLE "ProjectRequest"
      ADD CONSTRAINT "ProjectRequest_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
