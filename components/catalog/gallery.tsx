import type { MediaView } from "@/lib/catalog/types";
import { ProductImage } from "./product-image";

export function Gallery({ media, name }: { media: MediaView[]; name: string }) {
  const [first, ...rest] = media;
  return (
    <div className="flex flex-col gap-3">
      <figure className="flex flex-col gap-2">
        <ProductImage
          image={first ?? null}
          name={name}
          sizes="(min-width: 1024px) 50vw, 100vw"
          preload
          variant="detail"
        />
        {first && (
          <figcaption className="break-words font-mono text-xs text-muted">
            Abb. 1 · {first.altText}
          </figcaption>
        )}
      </figure>
      {rest.length > 0 && (
        <ul className="grid grid-cols-3 gap-3">
          {rest.map((m) => (
            <li key={m.storagePath}>
              <ProductImage
                image={m}
                name={name}
                sizes="(min-width: 1024px) 16vw, 33vw"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
