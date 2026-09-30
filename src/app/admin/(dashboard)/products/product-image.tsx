"use client";

import Image from "next/image";
import { useState } from "react";

// Displays a stored product image. Images are served as-is from the public Storage bucket
// (unoptimized: no remotePatterns entry, no optimization in the admin). A missing or
// broken file shows a short note instead of a broken image.
export function ProductImage({
  src,
  alt,
  size,
}: {
  src: string | null;
  alt: string;
  size: number;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src) {
    return <span className="admin-muted">No image</span>;
  }
  if (failedSrc === src) {
    return <span className="admin-muted">Image unavailable</span>;
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      unoptimized
      className="admin-image"
      onError={() => setFailedSrc(src)}
    />
  );
}
