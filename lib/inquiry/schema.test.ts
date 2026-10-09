import { describe, expect, it } from "vitest";
import {
  emptyInquiryValues,
  fieldErrors,
  inquirySchema,
  readInquiryForm,
  type InquiryValues,
} from "./schema";

const valid: InquiryValues = {
  orderNumber: "99010 - 1",
  quantity: "500",
  name: "Erika Muster",
  company: "",
  email: "erika@example.com",
  phone: "+49 (0)123 / 456-78",
  message: "",
  privacy: "on",
};

const errorsFor = (values: InquiryValues) => {
  const result = inquirySchema.safeParse(values);
  return result.success ? {} : fieldErrors(result.error);
};

describe("inquirySchema (FR-9, SC-9)", () => {
  it("accepts valid input and normalises empty optionals to null", () => {
    const result = inquirySchema.safeParse(valid);
    expect(result.success && result.data).toEqual({
      orderNumber: "99010 - 1",
      quantity: 500,
      name: "Erika Muster",
      company: null,
      email: "erika@example.com",
      phone: "+49 (0)123 / 456-78",
      message: null,
    });
  });

  it.each<[string, Partial<InquiryValues>, keyof InquiryValues, RegExp]>([
    [
      "order number too long",
      { orderNumber: "x".repeat(41) },
      "orderNumber",
      /40 Zeichen/,
    ],
    ["quantity not a number", { quantity: "viele" }, "quantity", /ganze Zahl/],
    ["quantity zero", { quantity: "0" }, "quantity", /ganze Zahl/],
    ["quantity too large", { quantity: "1000001" }, "quantity", /ganze Zahl/],
    ["quantity with decimals", { quantity: "1.5" }, "quantity", /ganze Zahl/],
    ["name missing", { name: "" }, "name", /Namen/],
    ["name too short", { name: "E" }, "name", /Namen/],
    ["name too long", { name: "x".repeat(101) }, "name", /100 Zeichen/],
    [
      "company too long",
      { company: "x".repeat(101) },
      "company",
      /100 Zeichen/,
    ],
    ["email invalid", { email: "erika@" }, "email", /E-Mail-Adresse/],
    [
      "email too long",
      { email: `${"x".repeat(250)}@example.com` },
      "email",
      /254 Zeichen|E-Mail-Adresse/,
    ],
    ["phone with letters", { phone: "0123 abc" }, "phone", /Ziffern/],
    ["phone too long", { phone: "1".repeat(41) }, "phone", /40 Zeichen/],
    [
      "message too long",
      { message: "x".repeat(2001) },
      "message",
      /2000 Zeichen/,
    ],
    ["privacy not confirmed", { privacy: "" }, "privacy", /Datenschutz/],
  ])("rejects %s with a German message", (_label, change, field, message) => {
    expect(errorsFor({ ...valid, ...change })[field]).toMatch(message);
  });

  it("needs an order number or a message", () => {
    expect(
      errorsFor({ ...valid, orderNumber: "", message: "" }).message
    ).toMatch(/Bestellnummer oder eine Nachricht/);
    expect(
      inquirySchema.safeParse({
        ...valid,
        orderNumber: "",
        message: "Bitte um Muster.",
      }).success
    ).toBe(true);
  });
});

describe("readInquiryForm", () => {
  it("reads every field as a string and a missing checkbox as empty", () => {
    const fd = new FormData();
    fd.set("name", "Erika");
    fd.set("unknown", "ignored");
    expect(readInquiryForm(fd)).toEqual({
      ...emptyInquiryValues(),
      name: "Erika",
    });
  });

  it("prefills the order number", () => {
    expect(emptyInquiryValues("99010 - 1").orderNumber).toBe("99010 - 1");
  });
});
