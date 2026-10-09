"use client";

import Link from "next/link";
import {
  useActionState,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { productPath } from "@/lib/catalog/anchors";
import type { VariantMatch } from "@/lib/catalog/variant-lookup";
import {
  fieldErrors,
  inquirySchema,
  readInquiryForm,
  type FieldErrors,
  type InquiryField,
} from "@/lib/inquiry/schema";
import type { InquiryState } from "@/lib/inquiry/submit";
import { InquiryResult } from "./inquiry-result";

export type Prefill =
  | { kind: "none" }
  | { kind: "found"; match: VariantMatch }
  | { kind: "unknown" };

type Props = {
  action: (prev: InquiryState, formData: FormData) => Promise<InquiryState>;
  initialState: InquiryState;
  prefill: Prefill;
  privacyUrl: string;
  officialSiteUrl: string;
};

export function InquiryForm({
  action,
  initialState,
  prefill,
  privacyUrl,
  officialSiteUrl,
}: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [clientErrors, setClientErrors] = useState<FieldErrors | null>(null);

  if (state.status === "discarded") {
    return <InquiryResult {...state} officialSiteUrl={officialSiteUrl} />;
  }

  const errors = clientErrors ?? state.fieldErrors;
  const values = state.values;

  // Same schema as the server (spec D6); the server validates again.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const parsed = inquirySchema.safeParse(
      readInquiryForm(new FormData(event.currentTarget))
    );
    if (parsed.success) {
      setClientErrors(null);
      return;
    }
    event.preventDefault();
    setClientErrors(fieldErrors(parsed.error));
  }

  const field = (
    name: InquiryField,
    label: string,
    input: (props: FieldProps) => ReactNode,
    extra?: ReactNode
  ) => (
    <Field name={name} label={label} error={errors[name]} extra={extra}>
      {input({
        id: `anfrage-${name}`,
        name,
        defaultValue: values[name],
        "aria-invalid": errors[name] ? true : undefined,
        "aria-describedby": errors[name] ? `anfrage-${name}-fehler` : undefined,
        className: "w-full rounded-md border border-line bg-paper px-3 py-2",
      })}
    </Field>
  );

  return (
    <form
      action={formAction}
      onSubmit={onSubmit}
      noValidate
      className="flex max-w-2xl flex-col gap-5"
    >
      {state.formError && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {state.formError}
        </p>
      )}
      {field(
        "orderNumber",
        "Bestellnummer",
        (p) => (
          <input {...p} maxLength={40} className={`${p.className} font-mono`} />
        ),
        <PrefillHint prefill={prefill} />
      )}
      {field("quantity", "Menge (optional)", (p) => (
        <input {...p} inputMode="numeric" />
      ))}
      {field("name", "Name", (p) => (
        <input {...p} autoComplete="name" />
      ))}
      {field("company", "Firma (optional)", (p) => (
        <input {...p} autoComplete="organization" />
      ))}
      {field("email", "E-Mail", (p) => (
        <input {...p} type="email" autoComplete="email" />
      ))}
      {field("phone", "Telefon (optional)", (p) => (
        <input {...p} type="tel" autoComplete="tel" />
      ))}
      {field("message", "Nachricht", (p) => (
        <textarea {...p} rows={5} />
      ))}
      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="privacy"
            defaultChecked={values.privacy === "on"}
            aria-invalid={errors.privacy ? true : undefined}
            aria-describedby={
              errors.privacy ? "anfrage-privacy-fehler" : undefined
            }
            className="mt-1"
          />
          <span>
            Ich habe die{" "}
            <a
              href={privacyUrl}
              className="text-accent underline underline-offset-2"
            >
              Datenschutzhinweise
            </a>{" "}
            gelesen.
          </span>
        </label>
        {errors.privacy && (
          <p id="anfrage-privacy-fehler" className="text-sm text-red-800">
            {errors.privacy}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-accent px-4 py-2 font-medium text-paper disabled:opacity-60"
      >
        Anfrage prüfen (wird nicht versendet)
      </button>
    </form>
  );
}

type FieldProps = {
  id: string;
  name: InquiryField;
  defaultValue: string;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
  className: string;
};

function Field({
  name,
  label,
  error,
  extra,
  children,
}: {
  name: InquiryField;
  label: string;
  error?: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`anfrage-${name}`} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {extra}
      {error && (
        <p id={`anfrage-${name}-fehler`} className="text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

function PrefillHint({ prefill }: { prefill: Prefill }) {
  if (prefill.kind === "found")
    return (
      <p className="text-sm text-muted">
        Produkt:{" "}
        <Link
          href={productPath(
            prefill.match.categorySlug,
            prefill.match.productSlug
          )}
          className="text-accent underline underline-offset-2"
        >
          {prefill.match.productName}
        </Link>
      </p>
    );
  if (prefill.kind === "unknown")
    return (
      <p className="text-sm text-muted">
        Diese Bestellnummer ist nicht im Katalog. Sie können sie korrigieren
        oder leer lassen.
      </p>
    );
  return null;
}
