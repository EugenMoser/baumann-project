import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  attributeInputsFor,
  type ArticleValues,
} from "@/lib/admin/article-schema";
import type { FormState } from "@/lib/admin/form";
import type {
  ArticleEditItem,
  AttributeOption,
  EditorOptions,
} from "@/lib/admin/products";
import { ArticleDialog } from "./article-dialog";
import { DeleteArticleButton } from "./delete-article-button";

type Props = {
  productId: number;
  articles: ArticleEditItem[];
  categoryAttributeIds: number[];
  options: EditorOptions;
  saveAction: (
    prev: FormState<ArticleValues>,
    formData: FormData
  ) => Promise<FormState<ArticleValues>>;
  deleteAction: (
    prev: FormState<null>,
    formData: FormData
  ) => Promise<FormState<null>>;
};

function describeAttributes(
  article: ArticleEditItem,
  all: readonly AttributeOption[]
): string {
  return article.attributes
    .flatMap((a) => {
      const def = all.find((o) => o.id === a.attributeId);
      if (!def) return [];
      const value =
        a.valueDecimal !== null
          ? String(a.valueDecimal).replace(".", ",")
          : (a.valueText ?? "");
      return [`${def.label} ${value}${def.unit ? ` ${def.unit}` : ""}`];
    })
    .join(", ");
}

export function ArticleSection({
  productId,
  articles,
  categoryAttributeIds,
  options,
  saveAction,
  deleteAction,
}: Props) {
  return (
    <section aria-labelledby="articles-heading" className="mt-10 grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="articles-heading" className="text-xl font-semibold">
          Artikel
        </h2>
        <ArticleDialog
          action={saveAction}
          productId={productId}
          article={null}
          attributes={attributeInputsFor(
            categoryAttributeIds,
            null,
            options.attributes
          )}
          materials={options.materials}
        />
      </div>
      {articles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Artikel.</p>
      ) : (
        <Table>
          <TableCaption className="sr-only">Artikel</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Nummer</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Attribute</TableHead>
              <TableHead>Verpackung</TableHead>
              <TableHead>Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {articles.map((article) => (
              <TableRow key={article.id}>
                <TableCell>{article.articleNumber}</TableCell>
                <TableCell>{article.name ?? ""}</TableCell>
                <TableCell>
                  {describeAttributes(article, options.attributes)}
                </TableCell>
                <TableCell>
                  {article.packaging.map((p) => p.quantity).join(" / ")}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <ArticleDialog
                      action={saveAction}
                      productId={productId}
                      article={article}
                      attributes={attributeInputsFor(
                        categoryAttributeIds,
                        article,
                        options.attributes
                      )}
                      materials={options.materials}
                    />
                    <DeleteArticleButton
                      action={deleteAction}
                      productId={productId}
                      articleId={article.id}
                      articleNumber={article.articleNumber}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
