import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, type ProductStatus } from "@/lib/admin/labels";

const VARIANT = {
  published: "default",
  draft: "secondary",
  archived: "outline",
} as const satisfies Record<ProductStatus, string>;

export function StatusBadge({ status }: { status: ProductStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
