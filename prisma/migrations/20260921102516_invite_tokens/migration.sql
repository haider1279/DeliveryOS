-- AlterTable
ALTER TABLE "User" ADD COLUMN     "inviteTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "inviteTokenHash" TEXT;

-- CreateIndex
CREATE INDEX "User_inviteTokenHash_idx" ON "User"("inviteTokenHash");
