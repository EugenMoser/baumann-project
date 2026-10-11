import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";

const check = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
}));
vi.mock("@/lib/supabase/session", () => ({
  createSessionSupabase: vi.fn(async () => ({})),
}));
vi.mock("./auth", () => ({
  LOGIN_PATH: "/admin/login",
  checkAdmin: () => check(),
}));

import { runWrite } from "./server";

beforeEach(() => {
  check.mockReset();
  check.mockResolvedValue({ kind: "admin", userId: "u", email: null });
});

describe("runWrite", () => {
  it("returns the value of a successful write", async () => {
    expect(
      await runWrite({ a: "1" }, "[admin] test", async () => ok({ id: 3 }))
    ).toEqual({ value: { id: 3 } });
  });
  it("maps a conflict with the default messages", async () => {
    const done = await runWrite({ a: "1" }, "[admin] test", async () =>
      err({ kind: "conflict", field: "slug" })
    );
    expect("state" in done && done.state.fieldErrors).toEqual({
      slug: "Dieser Slug ist in der Kategorie schon vergeben.",
    });
  });
  it("maps a conflict with caller-supplied messages", async () => {
    const done = await runWrite(
      { a: "1" },
      "[admin] test",
      async () => err({ kind: "conflict", field: "slug" }),
      { slug: "Dieser Slug ist schon vergeben." }
    );
    expect("state" in done && done.state).toMatchObject({
      status: "error",
      values: { a: "1" },
      fieldErrors: { slug: "Dieser Slug ist schon vergeben." },
    });
  });
  it("redirects an anonymous caller to the login without writing", async () => {
    check.mockResolvedValue({ kind: "anonymous" });
    const write = vi.fn();
    await expect(runWrite({}, "[admin] test", write)).rejects.toThrow(
      "redirect:/admin/login"
    );
    expect(write).not.toHaveBeenCalled();
  });
});
