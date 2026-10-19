import type { ReactNode } from "react";
import { Eyebrow } from "./eyebrow";

type Props = {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  titleId?: string;
};

export function PageHeader({ eyebrow, title, lead, titleId }: Props) {
  return (
    <header className="space-y-3">
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h1
        id={titleId}
        className="break-words text-3xl font-semibold tracking-tight sm:text-4xl"
      >
        {title}
      </h1>
      {lead ? <p className="max-w-2xl text-muted">{lead}</p> : null}
    </header>
  );
}
