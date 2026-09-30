// Staff product image management: upload/replace and remove (PROJECT.md Milestone 8).
//
// Same layering as ./management.ts: authorizeStaff() first, then input validation, then
// the stores. The ProductStore and ImageStorage both use the caller's own session, so the
// products RLS policies and the storage.objects policies (private.is_staff()) check the
// role again. Nothing about the target object comes from the browser: the product id is
// validated, the current image path is read from the database, the new path is generated
// here, and the bucket is fixed by the server.
//
// Order of operations (the working image is never lost):
//   1. upload the new object under a fresh name
//   2. point the row at it (compare-and-set on the previous path)
//   3. delete the previous object
// If step 2 fails, the new object is deleted again. If step 3 fails, the image is still
// replaced and the orphaned file is logged.
//
// Kept free of Next.js and "@/" imports so it runs under `npm test` (runtime relative
// imports carry the .ts extension for Node's type stripping).

import {
  imageIssueLog,
  isStoragePermissionError,
  type ImageStorage,
} from "../images/storage.ts";
import {
  isImageObjectPath,
  newImageObjectPath,
  validateImageFile,
} from "../images/validation.ts";

import {
  PRODUCT_MESSAGES,
  authorizeStaff,
  isPermissionError,
  parseProductId,
  type ActionResult,
  type ProductAccess,
  type ProductStore,
} from "./management.ts";

export const PRODUCT_IMAGE_MESSAGES = {
  saved: "Image saved.",
  savedOldNotRemoved:
    "Image saved. The previous image file could not be deleted from storage; it is no longer used.",
  removed: "Image removed.",
  removedFileNotDeleted:
    "Image removed from the product. The file could not be deleted from storage; it is no longer used.",
  noImage: "This product has no image.",
  notPermitted: "You are not allowed to change product images.",
  uploadFailed: "Could not upload the image. Please try again.",
  saveFailed: "Could not save the image. Please try again.",
  changed:
    "The product was changed or deleted while the image was being saved. Reload the page and try again.",
  removeFailed: "Could not remove the image. Please try again.",
} as const;

/** Deletes an object that was uploaded but never referenced. */
async function discardUpload(images: ImageStorage, path: string): Promise<void> {
  const removed = await images.remove([path]);
  if (!removed.ok) {
    imageIssueLog.report("orphaned_upload", { path, error: removed.error });
  }
}

/** Deletes a previous image that the row no longer references. */
async function removeOldImage(images: ImageStorage, productId: string, path: string | null) {
  // The stored path is checked against the convention and the product's own folder (the
  // database constraint enforces the same) before anything is deleted.
  if (!isImageObjectPath(path, productId)) {
    return true;
  }
  const removed = await images.remove([path]);
  if (!removed.ok) {
    imageIssueLog.report("old_image_cleanup_failed", { path, error: removed.error });
    return false;
  }
  return true;
}

/** Uploads an image for a product, replacing its current image if it has one. */
export async function setProductImage(
  access: ProductAccess,
  store: ProductStore,
  images: ImageStorage,
  rawId: unknown,
  rawFile: unknown,
  randomId?: () => string,
): Promise<ActionResult> {
  const staff = authorizeStaff(access);
  if (!staff.ok) {
    return staff;
  }
  const id = parseProductId(rawId);
  if (!id) {
    return { ok: false, error: PRODUCT_MESSAGES.invalidProduct };
  }
  const file = await validateImageFile(rawFile);
  if (!file.ok) {
    return file;
  }

  const current = await store.get(id);
  if (!current.ok) {
    return { ok: false, error: PRODUCT_MESSAGES.loadOneFailed };
  }
  if (!current.value) {
    return { ok: false, error: PRODUCT_MESSAGES.notFound };
  }
  const previousPath = current.value.imagePath;

  const path = newImageObjectPath(id, file.image.extension, randomId);
  const uploaded = await images.upload(path, file.image);
  if (!uploaded.ok) {
    imageIssueLog.report("upload_failed", { path, error: uploaded.error });
    return {
      ok: false,
      error: isStoragePermissionError(uploaded.error)
        ? PRODUCT_IMAGE_MESSAGES.notPermitted
        : PRODUCT_IMAGE_MESSAGES.uploadFailed,
    };
  }

  const saved = await store.setImagePath(id, path, previousPath);
  if (!saved.ok || !saved.value) {
    if (!saved.ok) {
      imageIssueLog.report("reference_update_failed", { path, error: saved.error });
    }
    await discardUpload(images, path);
    if (!saved.ok) {
      return {
        ok: false,
        error: isPermissionError(saved.error)
          ? PRODUCT_IMAGE_MESSAGES.notPermitted
          : PRODUCT_IMAGE_MESSAGES.saveFailed,
      };
    }
    return { ok: false, error: PRODUCT_IMAGE_MESSAGES.changed };
  }

  const cleaned = await removeOldImage(images, id, previousPath);
  return {
    ok: true,
    message: cleaned ? PRODUCT_IMAGE_MESSAGES.saved : PRODUCT_IMAGE_MESSAGES.savedOldNotRemoved,
  };
}

/** Removes a product's image: clears the reference, then deletes the file. */
export async function removeProductImage(
  access: ProductAccess,
  store: ProductStore,
  images: ImageStorage,
  rawId: unknown,
): Promise<ActionResult> {
  const staff = authorizeStaff(access);
  if (!staff.ok) {
    return staff;
  }
  const id = parseProductId(rawId);
  if (!id) {
    return { ok: false, error: PRODUCT_MESSAGES.invalidProduct };
  }

  const current = await store.get(id);
  if (!current.ok) {
    return { ok: false, error: PRODUCT_MESSAGES.loadOneFailed };
  }
  if (!current.value) {
    return { ok: false, error: PRODUCT_MESSAGES.notFound };
  }
  const previousPath = current.value.imagePath;
  if (previousPath === null) {
    return { ok: false, error: PRODUCT_IMAGE_MESSAGES.noImage };
  }

  const cleared = await store.setImagePath(id, null, previousPath);
  if (!cleared.ok) {
    return {
      ok: false,
      error: isPermissionError(cleared.error)
        ? PRODUCT_IMAGE_MESSAGES.notPermitted
        : PRODUCT_IMAGE_MESSAGES.removeFailed,
    };
  }
  if (!cleared.value) {
    return { ok: false, error: PRODUCT_IMAGE_MESSAGES.changed };
  }

  const cleaned = await removeOldImage(images, id, previousPath);
  return {
    ok: true,
    message: cleaned ? PRODUCT_IMAGE_MESSAGES.removed : PRODUCT_IMAGE_MESSAGES.removedFileNotDeleted,
  };
}
