import type { Branding } from "@/config/branding";

export function FactsBar({ facts }: { facts: Branding["home"]["facts"] }) {
  if (facts.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
      {facts.map((f) => (
        <div key={f.value} className="min-w-0 bg-paper p-4">
          <dt className="break-words font-mono text-lg font-semibold">
            {f.value}
          </dt>
          <dd className="mt-1 break-words text-sm text-muted">{f.label}</dd>
        </div>
      ))}
    </dl>
  );
}
