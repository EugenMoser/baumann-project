import { ok, type Result } from "@/lib/result";
import type { Inquiry } from "./schema";

export interface InquirySender {
  send(inquiry: Inquiry): Promise<Result<void, string>>;
}

// The preview never sends inquiries (roadmap: validate and discard).
export class NoopInquirySender implements InquirySender {
  async send(): Promise<Result<void, string>> {
    return ok(undefined);
  }
}
