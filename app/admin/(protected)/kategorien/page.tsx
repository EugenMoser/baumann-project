import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listCategories } from "@/lib/admin/categories";
import { unwrapAdmin } from "@/lib/admin/server";
import { createSessionSupabase } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Kategorien" };

export default async function AdminCategoriesPage() {
  const client = await createSessionSupabase();
  const items = unwrapAdmin(await listCategories(client), "category list");
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Kategorien</h1>
        <Button asChild>
          <Link href="/admin/kategorien/neu">Kategorie anlegen</Link>
        </Button>
      </div>
      <Table className="mt-6">
        <TableCaption className="sr-only">Alle Kategorien</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Produkte</TableHead>
            <TableHead>Reihenfolge</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link
                  href={`/admin/kategorien/${c.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {c.name}
                </Link>
              </TableCell>
              <TableCell>{c.slug}</TableCell>
              <TableCell>{c.productCount}</TableCell>
              <TableCell>{c.sortOrder}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
