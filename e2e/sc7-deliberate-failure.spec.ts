import { expect, test } from "@playwright/test";

// Temporary: proves that a failing test turns CI red (SC-7). Reverted right after.
test("deliberately failing check (SC-7)", () => {
  expect(1).toBe(2);
});
