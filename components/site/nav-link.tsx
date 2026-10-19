"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active =
    pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`py-1 text-sm font-medium text-ink motion-safe:transition-colors motion-safe:duration-150 ${active ? "shadow-[inset_0_-2px_0] shadow-accent" : "hover:text-accent-strong"}`}
    >
      {children}
    </Link>
  );
}
