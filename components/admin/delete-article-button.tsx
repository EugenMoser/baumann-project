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

type Props = {
  action: (
    prev: FormState<null>,
    formData: FormData
  ) => Promise<FormState<null>>;
  productId: number;
  articleId: number;
  articleNumber: string;
};

export function DeleteArticleButton({
  action,
  productId,
  articleId,
  articleNumber,
}: Props) {
  // Toast in the wrapper: the row unmounts when the refreshed tree arrives.
  const run = async (prev: FormState<null>, formData: FormData) => {
    const next = await action(prev, formData);
    if (next.status === "saved") toast.success("Artikel gelöscht.");
    return next;
  };
  const [state, formAction, pending] = useActionState(run, idleState(null));
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          aria-label={`Artikel ${articleNumber} löschen`}
        >
          Löschen
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Artikel löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            Artikel {articleNumber} mit allen Attributen und
            Verpackungseinheiten wird endgültig gelöscht.
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
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="articleId" value={articleId} />
            <Button type="submit" variant="destructive" disabled={pending}>
              Endgültig löschen
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
