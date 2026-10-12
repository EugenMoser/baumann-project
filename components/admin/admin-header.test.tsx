import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminHeader } from "./admin-header";

describe("AdminHeader (SC-4)", () => {
  it("renders nav, e-mail and logout", () => {
    render(
      <AdminHeader
        email="admin@example.com"
        shortName="Muster"
        logoutAction={async () => {}}
      />
    );
    expect(
      screen.getByRole("navigation", { name: "Admin" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Produkte" })).toHaveAttribute(
      "href",
      "/admin/produkte"
    );
    expect(screen.getByRole("link", { name: "Zur Website" })).toHaveAttribute(
      "href",
      "/"
    );
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Abmelden" })
    ).toBeInTheDocument();
  });
  it("renders without an e-mail", () => {
    render(
      <AdminHeader
        email={null}
        shortName="Muster"
        logoutAction={async () => {}}
      />
    );
    expect(
      screen.getByRole("button", { name: "Abmelden" })
    ).toBeInTheDocument();
  });
  it("renders all admin sections (SC-12)", () => {
    render(
      <AdminHeader
        email="a@example.test"
        shortName="Demo"
        logoutAction={async () => {}}
      />
    );
    const nav = screen.getByRole("navigation", { name: "Admin" });
    const hrefs = {
      Produkte: "/admin/produkte",
      Kategorien: "/admin/kategorien",
      Farben: "/admin/farben",
      Materialien: "/admin/materialien",
    };
    for (const [name, href] of Object.entries(hrefs))
      expect(within(nav).getByRole("link", { name })).toHaveAttribute(
        "href",
        href
      );
  });
});
