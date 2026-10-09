import { describe, expect, it } from "vitest";
import { aiLabelText } from "./ai-label";

describe("aiLabelText (FR-13, SC-13)", () => {
  it("labels ai and ai_edited, not human", () => {
    expect(aiLabelText("ai")).toBe("KI-generiert");
    expect(aiLabelText("ai_edited")).toBe(
      "KI-unterstützt, redaktionell bearbeitet"
    );
    expect(aiLabelText("human")).toBeNull();
  });
});
