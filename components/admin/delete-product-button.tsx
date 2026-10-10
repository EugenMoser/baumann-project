"use client";

import { useActionState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { idleState, type FormState } from "@/lib/admin/form";

type Props = {
  action: (
    prev: FormState<null>,
    formData: FormData
  ) => Promise<FormState<null>>;
  productId: number;
  productName: string;
};

export function DeleteProductButton({ action, productId, productName }: Props) {
  const [state, formAction, pending] = useActionState(action, idleState(null));
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="destructive"
          className="justify-self-start"
        >
          Produkt löschen
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Produkt löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            „{productName}“ und alle Artikel, Farbzuordnungen und
            Zubehör-Verknüpfungen werden endgültig gelöscht.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {state.formError ? (
          <p role="alert" className="text-sm text-destructive">
            {state.formError}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <form action={formAction}>
            <input type="hidden" name="id" value={productId} />
            <Button type="submit" variant="destructive" disabled={pending}>
              Endgültig löschen
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
