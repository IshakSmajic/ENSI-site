import Link from "next/link";

import { ADMIN_PRODUCTS_PATH } from "@/lib/auth/roles";
import { requireStaff } from "@/lib/auth/staff";
import { getProduct } from "@/lib/products/management";
import { openProductStore, productImageUrl } from "@/lib/products/store";

import { ProductForm } from "../../product-form";
import { ProductImageForm } from "../../product-image-form";

export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]/edit">) {
  const user = await requireStaff();
  const { id } = await params;
  // Malformed ids are rejected before any query; unknown ids get the same message.
  const result = await getProduct({ status: "staff", user }, await openProductStore(), id);

  return (
    <main className="admin-narrow">
      <p>
        <Link href={ADMIN_PRODUCTS_PATH}>← Products</Link>
      </p>
      <h1>Edit product</h1>
      {result.ok ? (
        <>
          <ProductForm
            productId={result.product.id}
            initialValues={{
              name: result.product.name,
              slug: result.product.slug,
              description: result.product.description ?? "",
              category: result.product.category ?? "",
              price: result.product.price === null ? "" : result.product.price.toFixed(2),
              isAvailable: result.product.isAvailable,
              isFeatured: result.product.isFeatured,
            }}
          />
          <ProductImageForm
            productId={result.product.id}
            productName={result.product.name}
            imageUrl={productImageUrl(result.product.imagePath)}
          />
        </>
      ) : (
        <p role="alert" className="admin-error">
          {result.error}
        </p>
      )}
    </main>
  );
}
