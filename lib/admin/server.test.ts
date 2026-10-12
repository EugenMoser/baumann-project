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

import { editIdFrom, runWrite } from "./server";

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

describe("editIdFrom", () => {
  const form = (id?: string) => {
    const fd = new FormData();
    if (id !== undefined) fd.set("id", id);
    return fd;
  };
  it("treats an absent or empty id as create", () => {
    expect(editIdFrom(form())).toBeNull();
    expect(editIdFrom(form(""))).toBeNull();
  });
  it("returns the number of a valid id", () => {
    expect(editIdFrom(form("12"))).toBe(12);
  });
  it.each(["0", "abc", "-3", "1.5", "12345678901", " 4"])(
    "flags the malformed id %j",
    (raw) => {
      expect(editIdFrom(form(raw))).toBe("invalid");
    }
  );
  it("flags a file value as malformed", () => {
    const fd = new FormData();
    fd.set("id", new Blob(["x"]), "x.txt");
    expect(editIdFrom(fd)).toBe("invalid");
  });
});
