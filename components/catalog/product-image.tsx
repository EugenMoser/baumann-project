import Image from "next/image";
import { publicMediaUrl } from "@/lib/catalog/media";
import type { ImageRef } from "@/lib/catalog/types";

type Props = {
  image: ImageRef | null;
  name: string;
  sizes: string;
  priority?: boolean;
};

// Missing images reduce the display, never break it (spec, error handling).
export function ProductImage({ image, name, sizes, priority = false }: Props) {
  if (!image) {
    return (
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-md bg-surface p-4 text-center text-sm text-muted">
        <span className="font-medium text-ink">{name}</span>
        <span>Kein Bild</span>
      </div>
    );
  }
  return (
    <Image
      src={publicMediaUrl(image.storagePath)}
      alt={image.altText}
      width={image.width}
      height={image.height}
      sizes={sizes}
      priority={priority}
      className="aspect-[4/3] w-full rounded-md bg-surface object-contain"
    />
  );
}
