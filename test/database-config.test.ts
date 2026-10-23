import { describe, expect, test } from "vitest";
import { explainDatabaseError, postgresConfig } from "../src/server/store";

const SUPABASE = "postgresql://postgres.abcdefghij:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=no-verify";

describe("database connection settings", () => {
  test("without a CA certificate the connection string is used as given", () => {
    expect(postgresConfig(SUPABASE)).toEqual({ connectionString: SUPABASE });
  });

  test("with a CA certificate the server is fully verified and sslmode can't override it", () => {
    const config = postgresConfig(SUPABASE, "-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----");
    expect(config.connectionString).not.toContain("sslmode");
    expect(config.ssl).toEqual({ ca: "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----", rejectUnauthorized: true });
  });

  test("common mistakes come back as a sentence saying what to change", () => {
    expect(explainDatabaseError(new Error("self-signed certificate in certificate chain")).message).toMatch(/sslmode=no-verify/);
    expect(explainDatabaseError(new Error("getaddrinfo ENOTFOUND db.abc.supabase.co")).message).toMatch(/Session pooler/);
    expect(explainDatabaseError(new Error("(ENOTFOUND) tenant/user postgres.x not found")).message).toMatch(/user name and password/);
  });
});
