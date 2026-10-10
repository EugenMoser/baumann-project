import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProductFilter } from "@/lib/admin/filter";
import { STATUS_LABEL, type ProductStatus } from "@/lib/admin/labels";
import type { EditorOptions, ProductListItem } from "@/lib/admin/products";
import { selectClass } from "./field";
import { StatusBadge } from "./status-badge";

type Props = {
  items: ProductListItem[];
  filter: ProductFilter;
  categories: EditorOptions["categories"];
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });

export function ProductList({ items, filter, categories }: Props) {
  return (
    <div className="mt-6 grid gap-6">
      <form
        method="get"
        role="search"
        aria-label="Produkte filtern"
        className="flex flex-wrap items-end gap-4"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="filter-kategorie">Kategorie</Label>
          <select
            id="filter-kategorie"
            name="kategorie"
            defaultValue={filter.categoryId === null ? "" : filter.categoryId}
            className={selectClass}
          >
            <option value="">Alle Kategorien</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="filter-status">Status</Label>
          <select
            id="filter-status"
            name="status"
            defaultValue={filter.status ?? ""}
            className={selectClass}
          >
            <option value="">Alle Status</option>
            {(Object.keys(STATUS_LABEL) as ProductStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="filter-q">Name oder Artikelnummer</Label>
          <Input
            id="filter-q"
            name="q"
            type="search"
            defaultValue={filter.q ?? ""}
          />
        </div>
        <Button type="submit">Filtern</Button>
      </form>
      {items.length === 0 ? (
        <p>Keine Produkte gefunden.</p>
      ) : (
        <Table>
          <TableCaption className="sr-only">Produkte</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kategorie</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Artikel</TableHead>
              <TableHead>Geändert</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Link
                    href={`/admin/produkte/${item.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {item.name}
                  </Link>
                </TableCell>
                <TableCell>{item.categoryName}</TableCell>
                <TableCell>
                  <StatusBadge status={item.status} />
                </TableCell>
                <TableCell>{item.articleCount}</TableCell>
                <TableCell>{formatDate(item.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
