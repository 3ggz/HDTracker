import { describe, expect, it } from "vitest";
import { isAllowedEmail } from "./email";

describe("isAllowedEmail", () => {
  it("accepts company addresses", () => {
    expect(isAllowedEmail("mark@hdsecurity.systems")).toBe(true);
    expect(isAllowedEmail("  Gio@HDSecurity.Systems  ")).toBe(true);
  });

  it("rejects the bare domain and outside addresses", () => {
    expect(isAllowedEmail("@hdsecurity.systems")).toBe(false);
    expect(isAllowedEmail("someone@gmail.com")).toBe(false);
    expect(isAllowedEmail("mark@hdsecurity.systems.evil.com")).toBe(false);
  });

  // Mirrored in enforce_email_domain() (migration 0039). If this ever
  // goes red because someone restored strict domain-only checking,
  // the SQL function needs the same list, not this test deleted.
  it("accepts individually cleared addresses, casing and all", () => {
    expect(isAllowedEmail("nikita.fopiano@gmail.com")).toBe(true);
    expect(isAllowedEmail("Nikita.Fopiano@gmail.com")).toBe(true);
    expect(isAllowedEmail("nikita.fopiano@outlook.com")).toBe(false);
  });
});
