"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ADMIN_PRODUCTS_PATH } from "@/lib/auth/roles";
import { getAdminAccess } from "@/lib/auth/staff";
import { removeProductImage, setProductImage } from "@/lib/products/images";
import {
  PRODUCT_FIELDS,
  PRODUCT_MESSAGES,
  createProduct as createProductForStaff,
  deleteProduct as deleteProductForStaff,
  setProductFlag as setProductFlagForStaff,
  updateProduct as updateProductForStaff,
  type ActionResult,
  type ProductFormResult,
  type RawProductFields,
} from "@/lib/products/management";
import { openProductImageStorage, openProductStore } from "@/lib/products/store";

export type ProductFormState = Exclude<ProductFormResult, { ok: true }> | undefined;
export type ProductActionState = ActionResult | undefined;

// All Server Functions are public POST endpoints. The staff check happens inside the
// management functions, from the caller's verified session, and RLS checks the role again
// in the database. Only the known product fields are read from the form, so extra fields
// (id, image_path, timestamps, roles) cannot be mass-assigned.

function productFields(formData: FormData): RawProductFields {
  return Object.fromEntries(PRODUCT_FIELDS.map((field) => [field, formData.get(field)]));
}

export async function createProduct(
  _previousState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const result = await createProductForStaff(
    await getAdminAccess(),
    await openProductStore(),
    productFields(formData),
  );
  if (!result.ok) {
    return result;
  }
  revalidatePath(ADMIN_PRODUCTS_PATH);
  redirect(`${ADMIN_PRODUCTS_PATH}?notice=created`);
}

export async function updateProduct(
  _previousState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const result = await updateProductForStaff(
    await getAdminAccess(),
    await openProductStore(),
    formData.get("id"),
    productFields(formData),
  );
  if (!result.ok) {
    return result;
  }
  revalidatePath(ADMIN_PRODUCTS_PATH);
  redirect(`${ADMIN_PRODUCTS_PATH}?notice=updated`);
}

// The product list's buttons (status toggles and delete) share one Server Function and
// one result message. `intent` only selects which rule runs; each rule checks access itself.
export async function changeProduct(
  _previousState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const access = await getAdminAccess();
  const store = await openProductStore();
  const id = formData.get("id");

  let result: ActionResult;
  switch (formData.get("intent")) {
    case "set-flag":
      result = await setProductFlagForStaff(
        access,
        store,
        id,
        formData.get("flag"),
        formData.get("value"),
      );
      break;
    case "delete":
      result = await deleteProductForStaff(access, store, await openProductImageStorage(), id);
      break;
    default:
      return { ok: false, error: PRODUCT_MESSAGES.invalidFlag };
  }

  if (result.ok) {
    revalidatePath(ADMIN_PRODUCTS_PATH);
  }
  return result;
}

// The product image form (edit page): upload/replace or remove. Only the product id, the
// intent and the file are read. The bucket, the object path and the image being replaced
// are all decided on the server (src/lib/products/images.ts); Storage RLS checks the staff
// role again.
export async function changeProductImage(
  _previousState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const access = await getAdminAccess();
  const store = await openProductStore();
  const images = await openProductImageStorage();
  const id = formData.get("id");

  let result: ActionResult;
  switch (formData.get("intent")) {
    case "upload":
      result = await setProductImage(access, store, images, id, formData.get("image"));
      break;
    case "remove":
      result = await removeProductImage(access, store, images, id);
      break;
    default:
      return { ok: false, error: PRODUCT_MESSAGES.invalidFlag };
  }

  if (result.ok) {
    revalidatePath(ADMIN_PRODUCTS_PATH);
    revalidatePath(`${ADMIN_PRODUCTS_PATH}/[id]/edit`, "page");
  }
  return result;
}
