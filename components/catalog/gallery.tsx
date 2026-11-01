import type { MediaView } from "@/lib/catalog/types";
import { GallerySlider } from "./gallery-slider";
import { ProductImage } from "./product-image";

const SIZES = "(min-width: 1024px) 50vw, 100vw";

function Slide({
  image,
  name,
  index,
}: {
  image: MediaView;
  name: string;
  index: number;
}) {
  return (
    <figure className="flex flex-col gap-2">
      <ProductImage
        image={image}
        name={name}
        sizes={SIZES}
        preload={index === 0}
        variant="detail"
      />
      <figcaption className="break-words font-mono text-xs text-muted">
        Abb. {index + 1} · {image.altText}
      </figcaption>
    </figure>
  );
}

export function Gallery({ media, name }: { media: MediaView[]; name: string }) {
  if (media.length === 0) {
    return (
      <ProductImage image={null} name={name} sizes={SIZES} variant="detail" />
    );
  }
  if (media.length === 1) {
    return <Slide image={media[0]} name={name} index={0} />;
  }
  return (
    <GallerySlider total={media.length}>
      {media.map((m, i) => (
        <li key={m.storagePath}>
          <Slide image={m} name={name} index={i} />
        </li>
      ))}
    </GallerySlider>
  );
}
