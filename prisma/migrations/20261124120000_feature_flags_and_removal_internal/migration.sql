-- AlterTable
ALTER TABLE "tooling_listings" ADD COLUMN     "removedReasonInternal" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);
