"use client";

import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Props = { label: string; children: ReactNode };

// Explanation that works on touch: opens on click, tap, Enter and Space,
// closes on Escape, outside tap and a second tap; Radix returns focus to the
// button. Nothing depends on hover.
export function HelpPopover({ label, children }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <CircleHelp aria-hidden className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[calc(100vw-2rem)]">
        {children}
      </PopoverContent>
    </Popover>
  );
}
