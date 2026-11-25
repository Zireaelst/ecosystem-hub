-- CreateTable
CREATE TABLE "project_activities" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionId" TEXT,
    "program" TEXT NOT NULL,
    "targetId" TEXT,
    "targetName" TEXT,
    "event" TEXT NOT NULL,
    "reason" TEXT,
    "reasonInternal" BOOLEAN NOT NULL DEFAULT false,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_activities_projectId_createdAt_idx" ON "project_activities"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "project_activities_program_targetId_idx" ON "project_activities"("program", "targetId");

-- AddForeignKey
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "project_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: what the existing tables and the tooling audit entries already say, so older versions keep their history.

-- Hackathons: the version each stage entry holds now (earlier versions of an entry weren't kept), advances, and
-- withdrawn / disqualified submissions (their time is the submission's last update).
WITH entry AS (
  SELECT e.*, s."projectId", s."hackathonId", s."status", s."createdById", s."updatedAt" AS "subUpdatedAt",
         ev."name" || CASE WHEN (SELECT count(*) FROM "hackathon_stages" x WHERE x."hackathonId" = s."hackathonId") > 1 THEN ' · ' || st."name" ELSE '' END AS "targetName",
         row_number() OVER (PARTITION BY e."submissionId" ORDER BY st."order" DESC) AS "latest"
  FROM "hackathon_stage_entries" e
  JOIN "hackathon_submissions" s ON s."id" = e."submissionId"
  JOIN "hackathon_stages" st ON st."id" = e."stageId"
  JOIN "hackathons" h ON h."id" = s."hackathonId"
  JOIN "events" ev ON ev."id" = h."eventId"
)
INSERT INTO "project_activities" ("id", "projectId", "versionId", "program", "targetId", "targetName", "event", "actorId", "createdAt")
SELECT gen_random_uuid()::text, "projectId", "projectVersionId", 'hackathon', "hackathonId", "targetName", 'submitted', "createdById", "submittedAt" FROM entry
UNION ALL
SELECT gen_random_uuid()::text, "projectId", "projectVersionId", 'hackathon', "hackathonId", "targetName", 'advanced', "advancedById", "advancedAt" FROM entry WHERE "advancedAt" IS NOT NULL
UNION ALL
SELECT gen_random_uuid()::text, "projectId", "projectVersionId", 'hackathon', "hackathonId", "targetName", "status", NULL, "subUpdatedAt" FROM entry WHERE "latest" = 1 AND "status" IN ('withdrawn', 'disqualified');

-- Developer Tooling: from the listing's audit entries (tooling.submit|approve|reject|remove|withdraw). A withdraw that
-- closed the listing while a version was listed is an unlist; one that only cleared the version in review (or closed a
-- listing with nothing listed) withdrew the submission.
WITH a AS (
  SELECT l."projectId", l."id" AS "listingId", al."action", al."actorId", al."createdAt",
         al."before"->>'approvedVersionId' AS "listed", al."before"->>'pendingVersionId' AS "pending", al."after",
         (al."action" = 'tooling.withdraw' AND al."after"->>'closedReason' = 'withdrawn' AND al."before"->>'approvedVersionId' IS NOT NULL) AS "unlist"
  FROM "audit_logs" al JOIN "tooling_listings" l ON l."id" = al."entityId"
  WHERE al."entityType" = 'ToolingListing' AND al."action" LIKE 'tooling.%'
)
INSERT INTO "project_activities" ("id", "projectId", "versionId", "program", "targetId", "targetName", "event", "reason", "reasonInternal", "actorId", "createdAt")
SELECT gen_random_uuid()::text, a."projectId", v."id", 'tooling', a."listingId", 'Developer Tooling', x."event", x."reason", x."internal", a."actorId", a."createdAt"
FROM a
CROSS JOIN LATERAL (VALUES
  -- the event itself
  (CASE a."action" WHEN 'tooling.submit' THEN a."after"->>'versionId' WHEN 'tooling.approve' THEN a."after"->>'approvedVersionId'
     WHEN 'tooling.reject' THEN a."pending" WHEN 'tooling.remove' THEN a."listed" ELSE CASE WHEN a."unlist" THEN a."listed" ELSE a."pending" END END,
   CASE a."action" WHEN 'tooling.submit' THEN 'submitted' WHEN 'tooling.approve' THEN 'approved' WHEN 'tooling.reject' THEN 'rejected'
     WHEN 'tooling.remove' THEN 'removed' ELSE CASE WHEN a."unlist" THEN 'unlisted' ELSE 'withdrawn' END END,
   CASE a."action" WHEN 'tooling.reject' THEN a."after"->>'rejectReason' WHEN 'tooling.remove' THEN a."after"->>'reason' END,
   COALESCE((a."after"->>'internal')::boolean, false)),
  -- the listed version an approval replaced
  (CASE WHEN a."action" = 'tooling.approve' THEN a."listed" END, 'replaced', NULL, false),
  -- the version in review that a removal or an unlist took along
  (CASE WHEN a."action" = 'tooling.remove' OR a."unlist" THEN a."pending" END, CASE WHEN a."action" = 'tooling.remove' THEN 'removed' ELSE 'withdrawn' END, NULL, false)
) AS x("versionId", "event", "reason", "internal")
LEFT JOIN "project_versions" v ON v."id" = x."versionId" AND v."projectId" = a."projectId"
WHERE x."versionId" IS NOT NULL;
