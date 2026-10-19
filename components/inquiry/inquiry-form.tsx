"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { productPath } from "@/lib/catalog/anchors";
import type { VariantMatch } from "@/lib/catalog/variant-lookup";
import {
  fieldErrors,
  inquirySchema,
  INQUIRY_FIELDS,
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
  const formRef = useRef<HTMLFormElement>(null);
  const seenState = useRef(state);

  // After a server response, move focus to the first problem (skips the first render).
  useEffect(() => {
    if (seenState.current === state) return;
    seenState.current = state;
    if (state.status !== "editing") return;
    const target =
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      formRef.current?.querySelector<HTMLElement>('[role="alert"]');
    target?.focus();
  }, [state]);

  if (state.status === "discarded") {
    return <InquiryResult {...state} officialSiteUrl={officialSiteUrl} />;
  }

  const errors = clientErrors ?? state.fieldErrors;
  const values = state.values;
  const prefilled =
    prefill.kind === "none"
      ? null
      : initialState.status === "editing"
        ? initialState.values.orderNumber
        : null;
  const showPrefillHint =
    !errors.orderNumber &&
    prefilled !== null &&
    values.orderNumber === prefilled;

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
    const found = fieldErrors(parsed.error);
    setClientErrors(found);
    const first = INQUIRY_FIELDS.find((name) => found[name]);
    const element = first && event.currentTarget.elements.namedItem(first);
    if (element instanceof HTMLElement) element.focus();
  }

  const field = (
    name: InquiryField,
    label: string,
    input: (props: FieldProps) => ReactNode,
    extra?: { node: ReactNode; id: string }
  ) => (
    <Field name={name} label={label} error={errors[name]} extra={extra?.node}>
      {input({
        id: `anfrage-${name}`,
        name,
        defaultValue: values[name],
        "aria-invalid": errors[name] ? true : undefined,
        "aria-describedby":
          [extra?.id, errors[name] ? `anfrage-${name}-fehler` : null]
            .filter(Boolean)
            .join(" ") || undefined,
        className:
          "w-full border border-line bg-paper px-3 py-2 focus:border-ink motion-safe:transition-colors motion-safe:duration-150",
      })}
    </Field>
  );

  return (
    <form
      action={formAction}
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="flex max-w-2xl flex-col gap-5"
    >
      {state.formError && (
        <p
          role="alert"
          className="border border-red-300 bg-red-50 p-3 text-sm text-red-900"
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
        showPrefillHint && prefill.kind !== "none"
          ? {
              id: "anfrage-orderNumber-hinweis",
              node: <PrefillHint prefill={prefill} />,
            }
          : undefined
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
      {field(
        "message",
        "Nachricht",
        (p) => (
          <textarea {...p} rows={5} />
        ),
        {
          id: "anfrage-message-hinweis",
          node: (
            <p id="anfrage-message-hinweis" className="text-sm text-muted">
              Bitte geben Sie eine Bestellnummer oder eine Nachricht an.
            </p>
          ),
        }
      )}
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
              className="text-ink underline decoration-accent underline-offset-4 hover:text-accent-strong motion-safe:transition-colors motion-safe:duration-150"
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
        className="w-fit bg-accent-strong px-4 py-2 font-medium text-paper hover:bg-ink disabled:opacity-60 motion-safe:transition-colors motion-safe:duration-150"
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
      <p id="anfrage-orderNumber-hinweis" className="text-sm text-muted">
        Produkt:{" "}
        <Link
          href={productPath(
            prefill.match.categorySlug,
            prefill.match.productSlug
          )}
          className="text-ink underline decoration-accent underline-offset-4 hover:text-accent-strong motion-safe:transition-colors motion-safe:duration-150"
        >
          {prefill.match.productName}
        </Link>
      </p>
    );
  if (prefill.kind === "unknown")
    return (
      <p id="anfrage-orderNumber-hinweis" className="text-sm text-muted">
        Diese Bestellnummer ist nicht im Katalog. Sie können sie korrigieren
        oder leer lassen.
      </p>
    );
  return null;
}
