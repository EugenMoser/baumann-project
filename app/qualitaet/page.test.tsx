import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { branding } from "@/config/branding";
import type { CertificateView } from "@/lib/catalog/types";

vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("@/lib/catalog/load", () => ({ loadCertificates: vi.fn() }));

import { loadCertificates } from "@/lib/catalog/load";
import QualityPage from "./page";

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
  ],
};

describe("QualityPage (spec D4)", () => {
  beforeEach(() => {
    vi.mocked(loadCertificates).mockReset();
  });

  it("omits the certificate section but keeps the policy without certificates", async () => {
    vi.mocked(loadCertificates).mockResolvedValue([]);
    render(await QualityPage());
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Qualitäts- und Umweltpolitik/,
      })
    ).toBeVisible();
    expect(screen.getByText(branding.qualityPolicy[0])).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Zertifikate" })
    ).not.toBeInTheDocument();
  });

  it("shows the certificate section when certificates exist", async () => {
    vi.mocked(loadCertificates).mockResolvedValue([certificate]);
    render(await QualityPage());
    expect(screen.getByRole("heading", { name: "Zertifikate" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "ISO 9001 (Beispiel)" })
    ).toBeVisible();
  });
});
