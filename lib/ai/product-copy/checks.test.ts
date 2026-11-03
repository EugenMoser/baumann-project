import { describe, expect, it } from "vitest";
import { checkCopy, numbersIn } from "./checks.ts";

const sentence = "Das Formteil wird aus Polypropylen gespritzt.";
const description = sentence.repeat(2); // 90 characters
const good = {
  description,
  seoTitle: "Formteil aus Polypropylen für Reisemobile",
  seoDescription: "Formteil aus Polypropylen für Wohnwagen und Reisemobile.",
};
const none: ReadonlySet<string> = new Set();

function withField(field: keyof typeof good, value: string) {
  return { ...good, [field]: value };
}

function fail(raw: unknown, inputs: ReadonlySet<string> = none) {
  const result = checkCopy(raw, inputs);
  if (result.ok) throw new Error("expected a failure");
  return result;
}

describe("numbersIn", () => {
  it("keeps the decimal comma", () => {
    expect(numbersIn("15,5 mm und 2,0 mm bei 8 Stück")).toEqual([
      "15,5",
      "2,0",
      "8",
    ]);
  });

  it("removes thousands separators", () => {
    expect(numbersIn("1.000 Stück, 12.500 Stück, 1.234,5 g")).toEqual([
      "1000",
      "12500",
      "1234,5",
    ]);
  });

  it("splits ranges", () => {
    expect(numbersIn("Sechs Höhen von 8–15 mm")).toEqual(["8", "15"]);
  });

  it("writes a decimal dot as a comma, so both sides compare equal", () => {
    expect(numbersIn("15.5")).toEqual(["15,5"]);
  });

  it("returns nothing for text without numbers", () => {
    expect(numbersIn("Kein Wert. Ende.")).toEqual([]);
  });
});

describe("checkCopy (FR-3, SC-3)", () => {
  it("accepts a valid draft without numbers and an empty number set", () => {
    expect(checkCopy(good, none)).toEqual({ ok: true, value: good });
  });

  it("accepts numbers that occur in the input", () => {
    const raw = withField(
      "description",
      `${description} Höhe 15,5 mm, 8 Stück.`
    );
    expect(checkCopy(raw, new Set(["15,5", "8"])).ok).toBe(true);
  });

  describe("shape", () => {
    it.each([null, "text", 3, [], {}])("rejects %j", (raw) => {
      expect(fail(raw).failure).toBe("shape");
    });

    it("rejects a missing field and names it", () => {
      const raw = {
        description: good.description,
        seoDescription: good.seoDescription,
      };
      expect(fail(raw)).toEqual({
        ok: false,
        failure: "shape",
        field: "seoTitle",
      });
    });

    it("rejects a field that is empty after trimming", () => {
      expect(fail(withField("seoDescription", "  \n "))).toEqual({
        ok: false,
        failure: "shape",
        field: "seoDescription",
      });
    });

    it("rejects a non-string field", () => {
      expect(fail({ ...good, seoTitle: 5 }).failure).toBe("shape");
    });

    it("returns trimmed values", () => {
      const result = checkCopy(withField("seoTitle", "  Titel  "), none);
      expect(result.ok && result.value.seoTitle).toBe("Titel");
    });
  });

  describe("length", () => {
    it("rejects a description below 80 characters", () => {
      const short = "a".repeat(78) + ".";
      expect(fail(withField("description", short))).toEqual({
        ok: false,
        failure: "length",
        field: "description",
      });
    });

    it("accepts a description of exactly 80 and 699 characters", () => {
      const min = withField("description", "a".repeat(79) + ".");
      const max = withField("description", "a".repeat(698) + ".");
      expect(checkCopy(min, none).ok).toBe(true);
      expect(checkCopy(max, none).ok).toBe(true);
    });

    it("rejects a description of exactly 700 characters", () => {
      expect(fail(withField("description", "a".repeat(699) + "."))).toEqual({
        ok: false,
        failure: "length",
        field: "description",
      });
    });

    it("rejects a seoTitle of exactly 60 characters ending mid-word", () => {
      const title =
        "Formteil aus Polypropylen für Wohnwagen und Reisemobilherste";
      expect(title).toHaveLength(60);
      expect(fail(withField("seoTitle", title))).toEqual({
        ok: false,
        failure: "length",
        field: "seoTitle",
      });
    });

    it("accepts a seoTitle of 59 characters", () => {
      expect(checkCopy(withField("seoTitle", "a".repeat(59)), none).ok).toBe(
        true
      );
    });

    it("rejects a seoDescription of exactly 155 characters", () => {
      const text = "a".repeat(154) + ".";
      expect(text).toHaveLength(155);
      expect(fail(withField("seoDescription", text))).toEqual({
        ok: false,
        failure: "length",
        field: "seoDescription",
      });
    });

    it("accepts a seoDescription of 154 characters", () => {
      const raw = withField("seoDescription", "a".repeat(153) + ".");
      expect(checkCopy(raw, none).ok).toBe(true);
    });
  });

  describe("ending", () => {
    it.each(["description", "seoDescription"] as const)(
      "rejects a %s without sentence end",
      (field) => {
        expect(fail(withField(field, good[field].slice(0, -1)))).toEqual({
          ok: false,
          failure: "ending",
          field,
        });
      }
    );

    it.each([".", "!", "?"])("accepts a description ending with %s", (mark) => {
      const long = withField("description", description.slice(0, -1) + mark);
      expect(checkCopy(long, none).ok).toBe(true);
      expect(
        checkCopy(withField("seoDescription", `Text${mark}`), none).ok
      ).toBe(true);
    });

    it.each(["-", ",", ":", "–"])(
      "rejects a seoTitle ending with %s",
      (mark) => {
        expect(fail(withField("seoTitle", `Formteil ${mark}`))).toEqual({
          ok: false,
          failure: "ending",
          field: "seoTitle",
        });
      }
    );

    it("accepts a seoTitle without sentence end", () => {
      expect(
        checkCopy(withField("seoTitle", "Formteil (Typ A)"), none).ok
      ).toBe(true);
    });
  });

  describe("form", () => {
    it.each([
      ["a dash bullet", `${description}\n- Erster Punkt\n- Zweiter Punkt.`],
      ["an asterisk bullet", `${description}\n* Punkt.`],
      ["a dot bullet", `${description}\n• Punkt.`],
      ["a heading", `# Titel\n${description}${description}`],
      ["a numbered item", `${description}\n1. Punkt.`],
      ["bold text", `${description} Das ist **wichtig**.`],
      ["underscore emphasis", `${description} Das ist __wichtig__.`],
      ["a link", `${description} Siehe [Katalog](https://example.com).`],
    ])("rejects %s in the description", (_label, text) => {
      expect(fail(withField("description", text))).toEqual({
        ok: false,
        failure: "form",
        field: "description",
      });
    });

    it("accepts prose with a hyphen, a decimal and a bracket inside lines", () => {
      const text = `${description} Ein T-Stück (Typ A) misst 15,5 mm [ca.] und passt.`;
      expect(
        checkCopy(withField("description", text), new Set(["15,5"])).ok
      ).toBe(true);
    });
  });

  describe("script", () => {
    it("rejects a CJK character in the description", () => {
      expect(fail(withField("description", `${description} 你.`))).toEqual({
        ok: false,
        failure: "script",
        field: "description",
      });
    });

    it("rejects Cyrillic and emoji in the other fields", () => {
      expect(fail(withField("seoTitle", "Формteil")).field).toBe("seoTitle");
      expect(fail(withField("seoDescription", "Teil 🙂.")).field).toBe(
        "seoDescription"
      );
    });

    it("accepts umlauts, ß and the listed symbols", () => {
      const text = `${sentence} Größe „Maß“ ‚Typ‘ 5 × 2 ± 1 ⌀ 8 / 50 % 20 ° (Äußeres) – fertig.`;
      const inputs = new Set(["5", "2", "1", "8", "50", "20"]);
      expect(checkCopy(withField("description", text), inputs).ok).toBe(true);
    });
  });

  describe("numbers", () => {
    it("rejects a range that is not in the input (ADR 0004)", () => {
      const raw = withField(
        "description",
        `${description} Sechs Höhen von 8–15 mm.`
      );
      expect(fail(raw, new Set(["8", "15,5"]))).toEqual({
        ok: false,
        failure: "numbers",
        field: "description",
      });
    });

    it("rejects an invented number in a SEO field", () => {
      expect(
        fail(withField("seoTitle", "Abdeckung 12 mm"), new Set(["8"]))
      ).toEqual({ ok: false, failure: "numbers", field: "seoTitle" });
    });

    it("rejects any number against an empty set", () => {
      expect(fail(withField("seoDescription", "Mit 4 Farben.")).failure).toBe(
        "numbers"
      );
    });

    it("matches thousands separators on both sides", () => {
      const raw = withField("seoDescription", "Ab 1.000 Stück lieferbar.");
      expect(checkCopy(raw, new Set(numbersIn("1.000 Stück"))).ok).toBe(true);
    });

    it("treats a decimal dot in the input as a comma in the output", () => {
      const raw = withField("seoDescription", "Höhe 15,5 mm.");
      expect(checkCopy(raw, new Set(numbersIn("15.5"))).ok).toBe(true);
    });

    it("does not equate 2 with 2,0", () => {
      const raw = withField("seoDescription", "Höhe 2 mm.");
      expect(fail(raw, new Set(numbersIn("2,0")))).toEqual({
        ok: false,
        failure: "numbers",
        field: "seoDescription",
      });
    });
  });

  describe("normalisation", () => {
    it("accepts decomposed umlauts and returns NFC", () => {
      const nfd = "Kühlschrank-Abdeckung aus Polypropylen".normalize("NFD");
      expect(nfd).not.toBe(nfd.normalize("NFC"));
      const result = checkCopy(withField("seoTitle", nfd), none);
      expect(result.ok && result.value.seoTitle).toBe(nfd.normalize("NFC"));
    });
  });
});
