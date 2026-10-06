-- Better Auth 1.7.1 identifies OAuth accounts by issuer + accountId.
-- Keep application user ids and their progress unchanged.
ALTER TABLE "account" ADD COLUMN "issuer" TEXT NOT NULL DEFAULT '';

-- The previous configuration offered only Google and local passwords.
-- These synthetic namespaces match Better Auth 1.7.1's account resolvers.
UPDATE "account"
SET "issuer" = CASE
  WHEN "providerId" = 'credential' THEN 'local:credential'
  ELSE 'local:oauth:' || "providerId"
END;

CREATE UNIQUE INDEX "account_issuer_accountId_uidx"
  ON "account"("issuer", "accountId");
