import Image from "next/image";
import { publicMediaUrl } from "@/lib/catalog/media";
import type { ImageRef } from "@/lib/catalog/types";

type Variant = "tile" | "detail" | "thumb";

type Props = {
  image: ImageRef | null;
  name: string;
  sizes: string;
  preload?: boolean;
  variant?: Variant;
};

const BOX: Record<Variant, string> = {
  tile: "w-full aspect-[4/3] p-3",
  detail: "w-full aspect-[3/2] p-6",
  thumb: "size-14 border border-line p-1",
};

// Missing images reduce the display, never break it (spec, error handling).
export function ProductImage({
  image,
  name,
  sizes,
  preload = false,
  variant = "tile",
}: Props) {
  const box = `bg-surface ${BOX[variant]}`;
  if (!image) {
    if (variant === "thumb") {
      return <div aria-hidden="true" className={box} />;
    }
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 text-center text-sm text-muted ${box}`}
      >
        <span className="font-medium text-ink">{name}</span>
        <span>Kein Bild</span>
      </div>
    );
  }
  return (
    <div className={box}>
      <Image
        src={publicMediaUrl(image.storagePath)}
        alt={image.altText}
        width={image.width}
        height={image.height}
        sizes={sizes}
        preload={preload}
        className="h-full w-full object-contain mix-blend-multiply"
      />
    </div>
  );
}
