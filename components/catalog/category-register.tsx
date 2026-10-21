import Link from "next/link";
import type { RegisterItem } from "@/lib/catalog/types";
import { ProductImage } from "./product-image";

export function CategoryRegister({ items }: { items: RegisterItem[] }) {
  return (
    <ol className="border-t border-line">
      {items.map((c, i) => (
        <li key={c.slug} className="border-b border-line">
          <Link
            href={`/produkte/${encodeURIComponent(c.slug)}`}
            className="group flex items-center gap-4 py-4 hover:bg-surface sm:gap-6 sm:px-2"
          >
            <span
              aria-hidden="true"
              className="w-8 shrink-0 font-mono text-sm text-muted"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="break-words text-lg font-semibold group-hover:text-accent-strong">
                {c.name}
              </span>
              {c.subline ? (
                <span className="break-words text-sm text-muted">
                  {c.subline}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 font-mono text-sm text-muted">
              {c.productCount}{" "}
              {c.productCount === 1 ? "Produktgruppe" : "Produktgruppen"}
            </span>
            {c.thumbnails.length > 0 ? (
              <span className="hidden shrink-0 gap-2 sm:flex">
                {c.thumbnails.slice(0, 3).map((t) => (
                  <ProductImage
                    key={t.storagePath}
                    image={{ ...t, altText: "" }}
                    name=""
                    sizes="56px"
                    variant="thumb"
                  />
                ))}
              </span>
            ) : null}
            <span aria-hidden="true" className="shrink-0 text-muted">
              →
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
