export function inquiryPath(orderNumber?: string | null): string {
  return orderNumber
    ? `/anfrage?bestellnummer=${encodeURIComponent(orderNumber)}`
    : "/anfrage";
}
