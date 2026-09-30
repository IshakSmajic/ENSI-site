"use client";

import { useActionState, useState } from "react";

import {
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_LABEL,
  IMAGE_MESSAGES,
} from "@/lib/images/validation";

import { changeProductImage } from "./actions";
import { ProductImage } from "./product-image";

// The image section of the edit page. It is a separate form from the product details, so
// an upload never depends on (or blocks) saving the other fields. The browser checks here
// (accept, size) are for convenience only; the server validates the file again, and
// larger bodies are refused by the Server Action body limit (next.config.ts).
export function ProductImageForm({
  productId,
  productName,
  imageUrl,
}: {
  productId: string;
  productName: string;
  imageUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(changeProductImage, undefined);
  const [localError, setLocalError] = useState<string | null>(null);
  const hasImage = imageUrl !== null;

  return (
    <section aria-labelledby="product-image-heading" className="admin-image-section">
      <h2 id="product-image-heading">Image</h2>
      <ProductImage src={imageUrl} alt={productName} size={240} />

      {localError && (
        <p role="alert" className="admin-error">
          {localError}
        </p>
      )}
      {!localError && state && !state.ok && (
        <p role="alert" className="admin-error">
          {state.error}
        </p>
      )}
      {!localError && state?.ok && <p role="status">{state.message}</p>}

      <form
        action={formAction}
        className="admin-form"
        onSubmit={(event) => {
          const input = event.currentTarget.elements.namedItem("image");
          const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
          const error = !file
            ? IMAGE_MESSAGES.missing
            : file.size === 0
              ? IMAGE_MESSAGES.empty
              : file.size > IMAGE_MAX_BYTES
                ? IMAGE_MESSAGES.tooLarge
                : null;
          setLocalError(error);
          if (error) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="intent" value="upload" />
        <input type="hidden" name="id" value={productId} />
        <label htmlFor="product-image">{hasImage ? "Replace image" : "Add an image"}</label>
        <input
          id="product-image"
          name="image"
          type="file"
          accept={IMAGE_ACCEPT}
          required
          aria-describedby="product-image-hint"
        />
        <p id="product-image-hint" className="admin-muted">
          JPEG, PNG or WebP, at most {IMAGE_MAX_LABEL}. The image is public on the website.
        </p>
        <button type="submit" disabled={pending}>
          {pending ? "Uploading…" : hasImage ? "Replace image" : "Upload image"}
        </button>
      </form>

      {hasImage && (
        <form
          action={formAction}
          onSubmit={(event) => {
            setLocalError(null);
            if (!window.confirm(`Remove the image of “${productName}”?`)) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="intent" value="remove" />
          <input type="hidden" name="id" value={productId} />
          <button type="submit" disabled={pending}>
            Remove image
          </button>
        </form>
      )}
    </section>
  );
}
