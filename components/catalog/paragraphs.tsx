import { Fragment } from "react";
import { toParagraphs } from "@/lib/catalog/text";

export function Paragraphs({
  text,
  className,
}: {
  text: string | null;
  className?: string;
}) {
  const paragraphs = toParagraphs(text);
  if (paragraphs.length === 0) return null;
  return (
    <div
      className={className ?? "flex max-w-prose flex-col gap-3 leading-relaxed"}
    >
      {paragraphs.map((lines, i) => (
        <p key={i}>
          {lines.map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {line}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
