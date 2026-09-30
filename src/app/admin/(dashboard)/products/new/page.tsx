import Link from "next/link";

import { ADMIN_PRODUCTS_PATH } from "@/lib/auth/roles";
import { requireStaff } from "@/lib/auth/staff";

import { ProductForm } from "../product-form";

export default async function NewProductPage() {
  await requireStaff();

  return (
    <main className="admin-narrow">
      <p>
        <Link href={ADMIN_PRODUCTS_PATH}>← Products</Link>
      </p>
      <h1>Add product</h1>
      <p className="admin-muted">
        Save the product first; you can then add an image from its Edit page.
      </p>
      <ProductForm />
    </main>
  );
}
