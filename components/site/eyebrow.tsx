import type { ReactNode } from "react";

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-widest text-muted before:block before:h-0.5 before:w-[22px] before:shrink-0 before:bg-accent before:content-['']">
      {children}
    </p>
  );
}
