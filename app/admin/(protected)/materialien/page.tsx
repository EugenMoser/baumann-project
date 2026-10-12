import type { Metadata } from "next";
import { DeleteRecordButton } from "@/components/admin/delete-record-button";
import { MaterialDialog } from "@/components/admin/material-dialog";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listMaterials } from "@/lib/admin/master-data";
import { unwrapAdmin } from "@/lib/admin/server";
import { createSessionSupabase } from "@/lib/supabase/session";
import { deleteMaterialAction, saveMaterialAction } from "./actions";

export const metadata: Metadata = { title: "Materialien" };

export default async function AdminMaterialsPage() {
  const client = await createSessionSupabase();
  const items = unwrapAdmin(await listMaterials(client), "material list");
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Materialien</h1>
        <MaterialDialog action={saveMaterialAction} material={null} />
      </div>
      <Table className="mt-6">
        <TableCaption className="sr-only">Alle Materialien</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Kürzel</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Produkte</TableHead>
            <TableHead>Artikel</TableHead>
            <TableHead>Aktionen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="font-medium">{m.code}</TableCell>
              <TableCell>{m.name}</TableCell>
              <TableCell>{m.productCount}</TableCell>
              <TableCell>{m.articleCount}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <MaterialDialog action={saveMaterialAction} material={m} />
                  <DeleteRecordButton
                    action={deleteMaterialAction}
                    id={m.id}
                    title="Material löschen?"
                    description={`„${m.code}“ wird endgültig gelöscht.`}
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
