"use client";

import {
  closestCenter,
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { moveAnnouncement, moveItem } from "@/lib/admin/sortable";
import { cn } from "@/lib/utils";

type Props<T> = {
  items: readonly T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  noun: string;
  onReorder: (next: T[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
};

type Direction = "up" | "down";

// The library's English screen-reader texts are switched off; the list
// announces moves itself in German (see the live region below).
const silentAnnouncements: Announcements = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};
const noInstructions = { draggable: "" };

function SortableRow(props: {
  id: string;
  index: number;
  total: number;
  noun: string;
  onMove: (from: number, direction: Direction) => void;
  children: ReactNode;
}) {
  const { id, index, total, noun, onMove, children } = props;
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const n = index + 1;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-background p-3 motion-reduce:transition-none!",
        isDragging && "relative z-10 shadow-lg ring-2 ring-ring/50"
      )}
    >
      <div className="flex items-center gap-1 pt-1">
        <span
          aria-hidden="true"
          data-testid="position"
          className="min-w-4 text-center text-sm font-medium tabular-nums text-muted-foreground"
        >
          {n}
        </span>
        <div
          ref={setActivatorNodeRef}
          {...listeners}
          aria-hidden="true"
          data-testid="drag-handle"
          style={{ touchAction: "none" }}
          className="flex size-8 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-surface active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </div>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="min-h-6 min-w-6"
          data-move="up"
          aria-label={`${noun} ${n} nach oben`}
          disabled={index === 0}
          onClick={() => onMove(index, "up")}
        >
          ↑
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="min-h-6 min-w-6"
          data-move="down"
          aria-label={`${noun} ${n} nach unten`}
          disabled={index === total - 1}
          onClick={() => onMove(index, "down")}
        >
          ↓
        </Button>
      </div>
    </li>
  );
}

export function SortableList<T>({
  items,
  getKey,
  getLabel,
  noun,
  onReorder,
  renderItem,
}: Props<T>) {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    })
  );
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const pendingFocus = useRef<{ index: number; direction: Direction } | null>(
    null
  );

  // D4 focus rule: after a button move, focus stays on the pressed button of
  // the moved row; at an end of the list, on the row's other button.
  useEffect(() => {
    const pending = pendingFocus.current;
    pendingFocus.current = null;
    if (!pending) return;
    const row = listRef.current?.children[pending.index];
    const pick = (d: Direction) =>
      row?.querySelector<HTMLButtonElement>(`button[data-move="${d}"]`);
    const same = pick(pending.direction);
    const other = pick(pending.direction === "up" ? "down" : "up");
    (same && !same.disabled ? same : other)?.focus();
  }, [items]);

  const reorder = (from: number, to: number) => {
    const moved = items[from];
    if (moved === undefined || from === to) return;
    onReorder(moveItem(items, from, to));
    setAnnouncement(moveAnnouncement(getLabel(moved), to + 1, items.length));
  };

  const onMove = (from: number, direction: Direction) => {
    const to = direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= items.length) return;
    pendingFocus.current = { index: to, direction };
    reorder(from, to);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const keys = items.map(getKey);
    reorder(keys.indexOf(String(active.id)), keys.indexOf(String(over.id)));
  };

  return (
    <>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{
          announcements: silentAnnouncements,
          screenReaderInstructions: noInstructions,
        }}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={items.map(getKey)}
          strategy={verticalListSortingStrategy}
        >
          <ol ref={listRef} className="grid gap-3">
            {items.map((item, i) => (
              <SortableRow
                key={getKey(item)}
                id={getKey(item)}
                index={i}
                total={items.length}
                noun={noun}
                onMove={onMove}
              >
                {renderItem(item, i)}
              </SortableRow>
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </>
  );
}
