import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = {
  email: string | null;
  shortName: string;
  logoutAction: () => Promise<void>;
};

export function AdminHeader({ email, shortName, logoutAction }: Props) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
        <p className="font-semibold">Admin · {shortName}</p>
        <nav aria-label="Admin" className="flex gap-4 text-sm">
          <Link
            href="/admin/produkte"
            className="underline-offset-4 hover:underline"
          >
            Produkte
          </Link>
          <Link href="/" className="underline-offset-4 hover:underline">
            Zur Website
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {email ? (
            <span className="text-muted-foreground">{email}</span>
          ) : null}
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              Abmelden
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
