import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CertificateView } from "@/lib/catalog/types";
import { CertificateCard } from "./certificate-card";

const certificate: CertificateView = {
  standard: "ISO 9001 (Beispiel)",
  title: "Qualitätsmanagement (Beispiel)",
  preview: {
    storagePath: "certificates/test-iso-9001.png",
    width: 600,
    height: 848,
    altText: "Beispielzertifikat ISO 9001",
  },
  documents: [
    { language: "de", storagePath: "certificates/test-iso-9001-de.pdf" },
    { language: "en", storagePath: "certificates/test-iso-9001-en.pdf" },
  ],
};

describe("CertificateCard (FR-6, SC-6)", () => {
  it("renders the preview with size and alt text", () => {
    render(<CertificateCard certificate={certificate} />);
    const img = screen.getByRole("img", {
      name: "Beispielzertifikat ISO 9001",
    });
    expect(img).toHaveAttribute("width", "600");
    expect(img).toHaveAttribute("height", "848");
  });

  it("renders standard, title and one download link per language", () => {
    render(<CertificateCard certificate={certificate} />);
    expect(
      screen.getByRole("heading", { name: "ISO 9001 (Beispiel)" })
    ).toBeVisible();
    expect(screen.getByText("Qualitätsmanagement (Beispiel)")).toBeVisible();
    expect(screen.getByRole("link", { name: /PDF, Deutsch/ })).toHaveAttribute(
      "href",
      "http://127.0.0.1:54321/storage/v1/object/public/catalog/certificates/test-iso-9001-de.pdf"
    );
    expect(screen.getByRole("link", { name: /PDF, Englisch/ })).toHaveAttribute(
      "href",
      "http://127.0.0.1:54321/storage/v1/object/public/catalog/certificates/test-iso-9001-en.pdf"
    );
  });
});
