import type { Metadata } from "next";
import { ColorDialog } from "@/components/admin/color-dialog";
import { DeleteRecordButton } from "@/components/admin/delete-record-button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listColors } from "@/lib/admin/master-data";
import { unwrapAdmin } from "@/lib/admin/server";
import { createSessionSupabase } from "@/lib/supabase/session";
import { deleteColorAction, saveColorAction } from "./actions";

export const metadata: Metadata = { title: "Farben" };

export default async function AdminColorsPage() {
  const client = await createSessionSupabase();
  const items = unwrapAdmin(await listColors(client), "color list");
  const families = [...new Set(items.map((c) => c.family))].sort((a, b) =>
    a.localeCompare(b, "de")
  );
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Farben</h1>
        <ColorDialog
          action={saveColorAction}
          color={null}
          families={families}
        />
      </div>
      <Table className="mt-6">
        <TableCaption className="sr-only">Alle Farben</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Farbe</TableHead>
            <TableHead>RAL</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Familie</TableHead>
            <TableHead>Produkte</TableHead>
            <TableHead>Aktionen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-5 shrink-0 rounded border border-border"
                    style={{ background: c.hexCode }}
                  />
                  <span className="font-medium">{c.name}</span>
                </span>
              </TableCell>
              <TableCell>{c.ralReference ?? ""}</TableCell>
              <TableCell>{c.hexCode}</TableCell>
              <TableCell>{c.family}</TableCell>
              <TableCell>{c.productCount}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <ColorDialog
                    action={saveColorAction}
                    color={c}
                    families={families}
                  />
                  <DeleteRecordButton
                    action={deleteColorAction}
                    id={c.id}
                    title="Farbe löschen?"
                    description={`„${c.name}“ wird endgültig gelöscht.`}
                    buttonLabel="Löschen"
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
