import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { branding } from "@/config/branding";
import PrivacyPage from "./page";

describe("PrivacyPage (5b)", () => {
  it("renders the headings in order (SC-1, FR-1)", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Datenschutzerklärung"
    );
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)
    ).toEqual([
      "Verantwortlicher",
      "Überblick",
      "Hosting",
      "Aufruf der Website",
      "Anfrageformular",
      "Kontakt per E-Mail",
      "Admin-Bereich",
      "Ihre Rechte",
      "Widerspruchsrecht (Art. 21 DSGVO)",
      "Beschwerderecht",
    ]);
  });

  it("states the server-log sentence verbatim (SC-1)", () => {
    render(<PrivacyPage />);
    expect(
      screen.getByText(
        /Fehlermeldungen des Servers können Ihre IP-Adresse enthalten\. Sie werden spätestens nach 30 Tagen gelöscht, auch in den Sicherungen\./
      )
    ).toBeTruthy();
  });

  it("describes e-mail contact with the retention periods of the developer's mailbox (legal B1)", () => {
    const { container } = render(<PrivacyPage />);
    const text = container.textContent ?? "";
    expect(text).toContain(
      "wenn Sie die Website aufrufen, das Anfrageformular ausprobieren oder mir eine E-Mail schreiben."
    );
    const section = screen
      .getByRole("heading", { level: 2, name: "Kontakt per E-Mail" })
      .closest("section");
    const sectionText = section?.textContent ?? "";
    expect(sectionText).toContain(
      "Nachrichten, aus denen kein Auftrag entsteht, lösche ich sechs Monate nach der letzten Nachricht."
    );
    expect(sectionText).toContain("Art. 6 Abs. 1 lit. b DSGVO");
    expect(sectionText).toContain("§ 147 AO, § 14b UStG");
    expect(sectionText).toContain(
      "bis zum Ende des dritten Kalenderjahres nach Abschluss des Auftrags"
    );
  });

  it("points to the imprint for the postal address (legal S2)", () => {
    const { container } = render(<PrivacyPage />);
    expect(container.textContent).toContain(
      "Meine Postanschrift finden Sie in meinem Impressum."
    );
  });

  it("links the e-mail and the imprint (SC-1, FR-2)", () => {
    render(<PrivacyPage />);
    const mails = screen.getAllByRole("link", {
      name: branding.developer.email,
    });
    expect(mails.length).toBeGreaterThan(0);
    for (const a of mails) {
      expect(a.getAttribute("href")).toBe(`mailto:${branding.developer.email}`);
    }
    expect(
      screen.getByRole("link", { name: "Impressum" }).getAttribute("href")
    ).toBe(branding.developer.imprintUrl);
  });

  it("marks the inquiry section with its anchor (FR-4)", () => {
    render(<PrivacyPage />);
    const section = document.getElementById("anfrageformular");
    expect(section).not.toBeNull();
    expect(section?.querySelector("h2")?.textContent).toBe("Anfrageformular");
  });

  it("emphasises the Art. 21 section (FR-1)", () => {
    render(<PrivacyPage />);
    const p = screen.getByText(/^Soweit ich Daten/);
    expect(p.classList.contains("font-medium")).toBe(true);
  });

  it("names no customer (FR-6)", () => {
    const { container } = render(<PrivacyPage />);
    const text = container.textContent ?? "";
    expect(text).not.toContain(branding.companyName);
    expect(text).not.toMatch(new RegExp(`\\b${branding.shortName}\\b`));
  });

  it("ends with the date line", () => {
    render(<PrivacyPage />);
    expect(screen.getByText("Stand: November 2026")).toBeTruthy();
  });
});
