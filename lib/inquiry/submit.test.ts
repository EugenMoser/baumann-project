import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";
import type { VariantMatch } from "@/lib/catalog/variant-lookup";
import { handleInquiry, LOOKUP_UNAVAILABLE, type InquiryDeps } from "./submit";

const MATCH: VariantMatch = {
  orderNumber: "99010 - 1",
  productName: "Testkeil mit Dämpfung",
  categorySlug: "moebelteile",
  productSlug: "testkeil-mit-daempfung",
};

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

const VALID = {
  orderNumber: "99010-1",
  quantity: "500",
  name: "Erika Muster",
  email: "erika@example.com",
  privacy: "on",
};

function deps(over: Partial<InquiryDeps> = {}) {
  return {
    findVariant: vi.fn(async () => ok(MATCH)),
    sender: { send: vi.fn(async () => ok(undefined)) },
    logError: vi.fn(),
    ...over,
  } satisfies InquiryDeps;
}

describe("handleInquiry (FR-10, SC-10)", () => {
  it("returns field errors and the submitted values without calling the sender", async () => {
    const d = deps();
    const state = await handleInquiry(form({ ...VALID, email: "kaputt" }), d);
    expect(state.status).toBe("editing");
    if (state.status !== "editing") return;
    expect(state.fieldErrors.email).toMatch(/E-Mail-Adresse/);
    expect(state.values).toMatchObject({
      name: "Erika Muster",
      email: "kaputt",
      orderNumber: "99010-1",
    });
    expect(d.sender.send).not.toHaveBeenCalled();
    expect(d.findVariant).not.toHaveBeenCalled();
  });

  it("reports an unknown order number as a field error", async () => {
    const d = deps({
      findVariant: vi.fn(async () => err({ kind: "not_found" as const })),
    });
    const state = await handleInquiry(form(VALID), d);
    expect(state.status === "editing" && state.fieldErrors.orderNumber).toMatch(
      /nicht im Katalog/
    );
    expect(d.sender.send).not.toHaveBeenCalled();
  });

  it("reports a lookup error as a form error and logs no submitted value (FR-12, SC-12, Review Focus 5)", async () => {
    const d = deps({
      findVariant: vi.fn(async () =>
        err({
          kind: "db_error" as const,
          code: "08006",
          message: "connection refused for 99010-1",
        })
      ),
    });
    const state = await handleInquiry(
      form({ ...VALID, phone: "0123 456", message: "Geheim" }),
      d
    );
    expect(state.status === "editing" && state.formError).toBe(
      LOOKUP_UNAVAILABLE
    );
    expect(state.status === "editing" && state.values.name).toBe(
      "Erika Muster"
    );
    expect(d.logError).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(vi.mocked(d.logError).mock.calls);
    for (const value of [
      "Erika Muster",
      "erika@example.com",
      "99010",
      "500",
      "0123 456",
      "Geheim",
    ]) {
      expect(logged).not.toContain(value);
    }
  });

  it("calls the sender once and returns discarded with the canonical order number", async () => {
    const d = deps();
    expect(await handleInquiry(form(VALID), d)).toEqual({
      status: "discarded",
      orderNumber: "99010 - 1",
      productName: "Testkeil mit Dämpfung",
      quantity: 500,
    });
    expect(d.sender.send).toHaveBeenCalledTimes(1);
  });

  it("does not look up anything without an order number", async () => {
    const d = deps();
    const state = await handleInquiry(
      form({ ...VALID, orderNumber: "", message: "Bitte um Muster." }),
      d
    );
    expect(state).toEqual({
      status: "discarded",
      orderNumber: null,
      productName: null,
      quantity: 500,
    });
    expect(d.findVariant).not.toHaveBeenCalled();
  });
});
