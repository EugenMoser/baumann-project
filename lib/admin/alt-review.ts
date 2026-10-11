// D10: the import set every alt text to the product name.
export function needsAltReview(
  productName: string,
  altTexts: readonly string[]
): boolean {
  const name = productName.trim().toLocaleLowerCase("de");
  return altTexts.some((alt) => alt.trim().toLocaleLowerCase("de") === name);
}
