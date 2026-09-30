"use client";

import Link from "next/link";
import { useActionState } from "react";

import { ADMIN_PRODUCTS_PATH } from "@/lib/auth/roles";
import {
  CATEGORY_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  SLUG_MAX_LENGTH,
  type ProductField,
  type ProductFormValues,
} from "@/lib/products/management";

import { createProduct, updateProduct } from "./actions";

const EMPTY_VALUES: ProductFormValues = {
  name: "",
  slug: "",
  description: "",
  category: "",
  price: "",
  isAvailable: true,
  isFeatured: false,
};

// Create (no productId) and edit (productId + initial values) share this form. The
// browser constraints are for convenience only; the server validates every field again.
export function ProductForm({
  productId,
  initialValues = EMPTY_VALUES,
}: {
  productId?: string;
  initialValues?: ProductFormValues;
}) {
  const [state, formAction, pending] = useActionState(
    productId ? updateProduct : createProduct,
    undefined,
  );
  // After a failed submission, show what was submitted rather than the original values.
  const values = state?.values ?? initialValues;
  const errors = state?.fieldErrors ?? {};

  function describedBy(field: ProductField, hint?: string) {
    const ids = [hint, errors[field] ? `product-${field}-error` : undefined].filter(Boolean);
    return ids.length > 0 ? ids.join(" ") : undefined;
  }

  function fieldError(field: ProductField) {
    return (
      errors[field] && (
        <p id={`product-${field}-error`} className="admin-error">
          {errors[field]}
        </p>
      )
    );
  }

  return (
    // The key remounts the fields with the submitted values after each failed attempt.
    <form action={formAction} className="admin-form" key={state ? JSON.stringify(state) : "initial"}>
      {productId && <input type="hidden" name="id" value={productId} />}

      <label htmlFor="product-name">Name</label>
      <input
        id="product-name"
        name="name"
        defaultValue={values.name}
        maxLength={NAME_MAX_LENGTH}
        required
        aria-invalid={errors.name ? true : undefined}
        aria-describedby={describedBy("name")}
      />
      {fieldError("name")}

      <label htmlFor="product-slug">Slug (web address)</label>
      <input
        id="product-slug"
        name="slug"
        defaultValue={values.slug}
        maxLength={SLUG_MAX_LENGTH}
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
        autoCapitalize="none"
        spellCheck={false}
        aria-invalid={errors.slug ? true : undefined}
        aria-describedby={describedBy("slug", "product-slug-hint")}
      />
      <p id="product-slug-hint" className="admin-muted">
        Lowercase letters, numbers and hyphens, e.g. chamomile-tea. Leave empty to generate it
        from the name.
        {productId && " Changing it changes the product's public address."}
      </p>
      {fieldError("slug")}

      <label htmlFor="product-category">Category (optional)</label>
      <input
        id="product-category"
        name="category"
        defaultValue={values.category}
        maxLength={CATEGORY_MAX_LENGTH}
        aria-invalid={errors.category ? true : undefined}
        aria-describedby={describedBy("category")}
      />
      {fieldError("category")}

      <label htmlFor="product-price">Price (optional)</label>
      <input
        id="product-price"
        name="price"
        defaultValue={values.price}
        inputMode="decimal"
        pattern="\d{1,8}([.,]\d{1,2})?"
        placeholder="6.50"
        aria-invalid={errors.price ? true : undefined}
        aria-describedby={describedBy("price", "product-price-hint")}
      />
      <p id="product-price-hint" className="admin-muted">
        Shown to visitors for information only. Leave empty to show no price.
      </p>
      {fieldError("price")}

      <label htmlFor="product-description">Description (optional)</label>
      <textarea
        id="product-description"
        name="description"
        defaultValue={values.description}
        maxLength={DESCRIPTION_MAX_LENGTH}
        rows={6}
        aria-invalid={errors.description ? true : undefined}
        aria-describedby={describedBy("description")}
      />
      {fieldError("description")}

      <label className="admin-checkbox">
        <input type="checkbox" name="is_available" defaultChecked={values.isAvailable} />
        Available
      </label>
      <label className="admin-checkbox">
        <input type="checkbox" name="is_featured" defaultChecked={values.isFeatured} />
        Featured
      </label>

      {state && (
        <p role="alert" className="admin-error">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : productId ? "Save changes" : "Create product"}
      </button>
      <Link href={ADMIN_PRODUCTS_PATH}>Cancel</Link>
    </form>
  );
}
