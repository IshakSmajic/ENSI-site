"use client";

import Link from "next/link";
import { useActionState } from "react";

import { ADMIN_PRODUCTS_PATH } from "@/lib/auth/roles";
import type { ProductSummary } from "@/lib/products/management";

import { changeProduct } from "./actions";
import { ProductImage } from "./product-image";

// One result state for the whole list: the message of the latest toggle/delete stays
// visible above the table. A notice from a redirect (created/saved) shows until then.
export function ProductList({
  products,
  notice,
}: {
  products: (ProductSummary & { imageUrl: string | null })[];
  notice: string | null;
}) {
  const [state, formAction, pending] = useActionState(changeProduct, undefined);

  return (
    <>
      {state && !state.ok && (
        <p role="alert" className="admin-error">
          {state.error}
        </p>
      )}
      {state?.ok && <p role="status">{state.message}</p>}
      {!state && notice && <p role="status">{notice}</p>}

      {products.length === 0 ? (
        <p>No products yet. Add the first one to start the catalogue.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Image</th>
                <th scope="col">Product</th>
                <th scope="col">Category</th>
                <th scope="col">Price</th>
                <th scope="col">Availability</th>
                <th scope="col">Featured</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <ProductImage src={product.imageUrl} alt="" size={56} />
                  </td>
                  <td>
                    <strong>{product.name}</strong>
                    <div className="admin-muted">{product.slug}</div>
                  </td>
                  <td>{product.category ?? "—"}</td>
                  <td>{product.price === null ? "—" : product.price.toFixed(2)}</td>
                  <td>
                    {product.isAvailable ? "Available" : "Unavailable"}
                    <FlagButton
                      action={formAction}
                      pending={pending}
                      id={product.id}
                      flag="available"
                      value={!product.isAvailable}
                      label={product.isAvailable ? "Mark unavailable" : "Mark available"}
                    />
                  </td>
                  <td>
                    {product.isFeatured ? "Featured" : "Not featured"}
                    <FlagButton
                      action={formAction}
                      pending={pending}
                      id={product.id}
                      flag="featured"
                      value={!product.isFeatured}
                      label={product.isFeatured ? "Unfeature" : "Feature"}
                    />
                  </td>
                  <td>
                    <div className="admin-actions">
                      <Link href={`${ADMIN_PRODUCTS_PATH}/${product.id}/edit`}>Edit</Link>
                      <form
                        action={formAction}
                        onSubmit={(event) => {
                          if (
                            !window.confirm(
                              `Delete “${product.name}” permanently? This cannot be undone.`,
                            )
                          ) {
                            event.preventDefault();
                          }
                        }}
                      >
                        {/* Only names the target; the server validates it and re-checks access. */}
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={product.id} />
                        <button type="submit" disabled={pending}>
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// Sends the desired value (not "toggle"), so a double submission or a stale page cannot
// flip the flag back.
function FlagButton({
  action,
  pending,
  id,
  flag,
  value,
  label,
}: {
  action: (formData: FormData) => void;
  pending: boolean;
  id: string;
  flag: "available" | "featured";
  value: boolean;
  label: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="intent" value="set-flag" />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="flag" value={flag} />
      <input type="hidden" name="value" value={String(value)} />
      <button type="submit" disabled={pending}>
        {label}
      </button>
    </form>
  );
}
