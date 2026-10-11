// components/admin/remove-image-button.tsx
"use client";

import { useActionState } from "react";
import { toast } from "sonner";
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

type RemoveAction = (
  prev: FormState<null>,
  formData: FormData
) => Promise<FormState<null>>;

export function RemoveImageButton(props: {
  action: RemoveAction;
  productId: number;
  mediaId: number;
  label: string;
}) {
  const run: RemoveAction = async (prev, formData) => {
    const next = await props.action(prev, formData);
    if (next.status === "saved") toast.success("Bild entfernt.");
    return next;
  };
  const [state, formAction, pending] = useActionState(run, idleState(null));
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`${props.label} entfernen`}
        >
          Entfernen
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bild entfernen?</AlertDialogTitle>
          <AlertDialogDescription>
            Das Bild wird vom Produkt entfernt und die Datei gelöscht.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {state.formError ? (
          <p role="alert" className="text-sm text-destructive">
            {state.formError}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          {/* Rendered in a portal: not nested in the image form. */}
          <form action={formAction}>
            <input type="hidden" name="productId" value={props.productId} />
            <input type="hidden" name="mediaId" value={props.mediaId} />
            <Button type="submit" variant="destructive" disabled={pending}>
              Endgültig entfernen
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
