import { describe, expect, it } from "vitest";
import { allowedEmail } from "./useSession";

describe("allowed email guard", () => {
  it("accepts the configured email case-insensitively", () => {
    expect(allowedEmail("Researcher@Example.com", "researcher@example.com")).toBe(true);
  });

  it("does not restrict access when no email is configured", () => {
    expect(allowedEmail("anyone@example.com", undefined)).toBe(true);
  });
});
