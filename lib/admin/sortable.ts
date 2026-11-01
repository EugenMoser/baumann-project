// Pure helpers for the admin sortable lists (colours, images).

export function moveItem<T>(
  items: readonly T[],
  from: number,
  to: number
): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

export function moveAnnouncement(
  label: string,
  position: number,
  total: number
): string {
  return `${label} steht jetzt auf Position ${position} von ${total}.`;
}
