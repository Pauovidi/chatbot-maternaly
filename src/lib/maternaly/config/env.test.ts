import { describe, expect, it } from "vitest";
import { getGoogleServiceAccountJson } from "@/lib/maternaly/config/env";

describe("Maternaly env config", () => {
  it("builds service account JSON from email and private key env vars", () => {
    const json = getGoogleServiceAccountJson({
      GOOGLE_PROJECT_ID: "demo-project",
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "service@example.test",
      GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nsecret\\n-----END PRIVATE KEY-----\\n",
    });

    expect(json).not.toBeNull();
    expect(JSON.parse(json ?? "")).toEqual({
      project_id: "demo-project",
      client_email: "service@example.test",
      private_key: "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----\n",
    });
  });
});
