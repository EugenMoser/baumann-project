import { describe, expect, it, vi } from "vitest";
import { NoopInquirySender } from "@/lib/inquiry/sender";

const handleInquiry = vi.hoisted(() => vi.fn());

vi.mock("@/lib/inquiry/submit", () => ({ handleInquiry }));
vi.mock("@/lib/catalog/variant-lookup", () => ({ findVariant: vi.fn() }));

import { submitInquiry } from "./actions";

describe("submitInquiry", () => {
  it("submits with the discarding sender the privacy policy describes (5b, legal N4)", async () => {
    handleInquiry.mockResolvedValue({ status: "editing" });
    const state = { status: "editing" } as never;
    await submitInquiry(state, new FormData());
    expect(handleInquiry).toHaveBeenCalledTimes(1);
    const deps = handleInquiry.mock.calls[0]?.[1] as { sender: unknown };
    expect(deps.sender).toBeInstanceOf(NoopInquirySender);
  });
});
