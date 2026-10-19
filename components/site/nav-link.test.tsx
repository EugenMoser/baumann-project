import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pathnameMock = vi.hoisted(() => vi.fn<() => string | null>());
vi.mock("next/navigation", () => ({ usePathname: pathnameMock }));

import { NavLink } from "./nav-link";

describe("NavLink (D5)", () => {
  beforeEach(() => {
    pathnameMock.mockReset();
  });

  it("marks the link active on a nested path below its href", () => {
    pathnameMock.mockReturnValue("/produkte/moebelteile/x");
    render(<NavLink href="/produkte">Produkte</NavLink>);
    expect(screen.getByRole("link", { name: "Produkte" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("marks the link active on the exact href", () => {
    pathnameMock.mockReturnValue("/produkte");
    render(<NavLink href="/produkte">Produkte</NavLink>);
    expect(screen.getByRole("link", { name: "Produkte" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("is not active on the home page", () => {
    pathnameMock.mockReturnValue("/");
    render(<NavLink href="/produkte">Produkte</NavLink>);
    expect(screen.getByRole("link", { name: "Produkte" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("is not active on a path that merely shares the href prefix", () => {
    pathnameMock.mockReturnValue("/anfrage-x");
    render(<NavLink href="/anfrage">Anfrage</NavLink>);
    expect(screen.getByRole("link", { name: "Anfrage" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("is not active when the pathname is null", () => {
    pathnameMock.mockReturnValue(null);
    render(<NavLink href="/produkte">Produkte</NavLink>);
    expect(screen.getByRole("link", { name: "Produkte" })).not.toHaveAttribute(
      "aria-current"
    );
  });
});
