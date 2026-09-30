import Link from "next/link";

import { ADMIN_HOME_PATH, ADMIN_PRODUCTS_PATH } from "@/lib/auth/roles";
import { requireStaff } from "@/lib/auth/staff";
import { listProducts, productNotice } from "@/lib/products/management";
import { openProductStore } from "@/lib/products/store";

import { ProductList } from "./product-list";

// Owner and Employee. Anonymous visitors and accounts without a role are redirected by
// the proxy and requireStaff(); the Server Functions check the role again, and RLS
// checks it in the database.
export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const user = await requireStaff();
  const result = await listProducts({ status: "staff", user }, await openProductStore());
  const noticeText = productNotice((await searchParams).notice);

  return (
    <main>
      <p>
        <Link href={ADMIN_HOME_PATH}>← Dashboard</Link>
      </p>
      <h1>Products</h1>
      <p>
        <Link href={`${ADMIN_PRODUCTS_PATH}/new`}>Add product</Link>
      </p>

      {result.ok ? (
        <ProductList products={result.products} notice={noticeText} />
      ) : (
        <p role="alert" className="admin-error">
          {result.error}
        </p>
      )}
    </main>
  );
}
