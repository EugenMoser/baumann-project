"use client";

import { useEffect, useRef } from "react";

type Props = {
  orderNumber: string | null;
  productName: string | null;
  quantity: number | null;
  officialSiteUrl: string;
};

export function InquiryResult({
  orderNumber,
  productName,
  quantity,
  officialSiteUrl,
}: Props) {
  const headingRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div
      role="status"
      className="flex flex-col gap-3 border border-line bg-surface p-6"
    >
      <p ref={headingRef} tabIndex={-1} className="font-semibold outline-none">
        Ihre Anfrage ist gültig, wurde aber nicht versendet – dies ist eine
        Vorschau.
      </p>
      {(orderNumber || quantity) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {orderNumber && (
            <>
              <dt className="text-muted">Bestellnummer</dt>
              <dd className="font-mono">{orderNumber}</dd>
            </>
          )}
          {productName && (
            <>
              <dt className="text-muted">Produkt</dt>
              <dd>{productName}</dd>
            </>
          )}
          {quantity !== null && (
            <>
              <dt className="text-muted">Menge</dt>
              <dd>{quantity.toLocaleString("de-DE")}</dd>
            </>
          )}
        </dl>
      )}
      <p className="text-sm">
        Für eine echte Anfrage wenden Sie sich bitte über die{" "}
        <a
          href={officialSiteUrl}
          className="text-ink underline decoration-accent underline-offset-4 hover:text-accent-strong motion-safe:transition-colors motion-safe:duration-150"
        >
          offizielle Website
        </a>{" "}
        an das Unternehmen.
      </p>
    </div>
  );
}
