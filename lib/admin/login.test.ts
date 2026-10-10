import { describe, expect, it } from "vitest";
import { LOGIN_FAILED, loginSchema } from "./login";

describe("login schema (SC-2)", () => {
  it("accepts e-mail and password", () => {
    expect(
      loginSchema.safeParse({ email: "a@example.com", password: "x" }).success
    ).toBe(true);
  });
  it.each([
    { email: "", password: "x" },
    { email: "a@example.com", password: "" },
    { email: "nope", password: "x" },
  ])("rejects %o", (input) =>
    expect(loginSchema.safeParse(input).success).toBe(false)
  );
  it("has one generic message", () => {
    expect(LOGIN_FAILED).toBe("E-Mail oder Passwort ist falsch.");
  });
});
