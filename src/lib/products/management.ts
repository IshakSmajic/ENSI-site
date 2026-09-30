// Staff product management: list, create, edit, delete, and toggle availability/featured
// status (PROJECT.md Milestone 7).
//
// Every operation takes the caller's resolved admin access and checks for a staff role
// (Owner or Employee) itself before touching the ProductStore, so a Server Function cannot
// forget the check. The store uses the caller's own session (publishable key), so the
// products RLS policies (private.is_staff()) are a second, independent layer.
//
// Only the fields listed in PRODUCT_FIELDS are ever read from a form and written to the
// database; id, image_path and the timestamps are never taken from the browser.
// updated_at is maintained by the products_set_updated_at trigger. Images (image_path) are
// managed by ./images.ts (Milestone 8).
//
// Messages returned to the browser are fixed strings; raw Supabase/PostgreSQL errors are
// never passed through.
//
// Kept free of Next.js and "@/" imports so it runs under `npm test`.

import type { StaffRole } from "../auth/roles";
import { removeOwnerImages, type ImageStorage } from "../images/storage.ts";

/** Structural subset of AdminAccess (src/lib/auth/staff.ts). */
export type ProductAccess =
  | { status: "anonymous" | "unauthorized" | "unavailable" }
  | { status: "staff"; user: { id: string; role: StaffRole } };

/** Supabase error details kept for decisions; never shown to the user. */
export type StoreError = { code?: string; status?: number };

export type StoreResult<T> = { ok: true; value: T } | { ok: false; error: StoreError };

/** Validated, normalized product values: the only columns this module ever writes. */
export type ProductInput = {
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  /** Decimal string such as "6.50" (numeric(10,2)), or null for no displayed price. */
  price: string | null;
  isAvailable: boolean;
  isFeatured: boolean;
};

export type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  price: number | null;
  isAvailable: boolean;
  isFeatured: boolean;
  /** Object path in the product-images bucket, or null (no image). */
  imagePath: string | null;
  updatedAt: string;
};

export type ProductDetails = ProductSummary & { description: string | null };

export type ProductFlag = "is_available" | "is_featured";

/** Product reads/writes with the caller's session. Implemented in ./supabase-store.ts. */
export interface ProductStore {
  list(): Promise<StoreResult<ProductSummary[]>>;
  get(id: string): Promise<StoreResult<ProductDetails | null>>;
  insert(input: ProductInput): Promise<StoreResult<{ id: string }>>;
  /** Returns false when no row with this id was updated. */
  update(id: string, input: ProductInput): Promise<StoreResult<boolean>>;
  /** Returns the product's name, or null when no row with this id was updated. */
  setFlag(id: string, flag: ProductFlag, value: boolean): Promise<StoreResult<{ name: string } | null>>;
  /**
   * Sets image_path only if it still equals `expected` (compare-and-set), so a concurrent
   * change is detected instead of overwritten. Returns false when no row was updated.
   */
  setImagePath(id: string, path: string | null, expected: string | null): Promise<StoreResult<boolean>>;
  /**
   * Returns the deleted product's name and stored image path, or null when no row with this
   * id was deleted.
   */
  remove(id: string): Promise<StoreResult<{ name: string; imagePath: string | null } | null>>;
}

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export const PRODUCT_FIELDS = [
  "name",
  "slug",
  "description",
  "category",
  "price",
  "is_available",
  "is_featured",
] as const;

export type ProductField = (typeof PRODUCT_FIELDS)[number];

/** Raw form values, keyed by field name. Anything else the browser sends is ignored. */
export type RawProductFields = Partial<Record<ProductField, unknown>>;

/** What the form shows again after a failed submission. */
export type ProductFormValues = {
  name: string;
  slug: string;
  description: string;
  category: string;
  price: string;
  isAvailable: boolean;
  isFeatured: boolean;
};

export type FieldErrors = Partial<Record<ProductField, string>>;

export type ProductFormResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors: FieldErrors; values: ProductFormValues };

export const NAME_MAX_LENGTH = 120;
export const SLUG_MAX_LENGTH = 100;
export const CATEGORY_MAX_LENGTH = 60;
export const DESCRIPTION_MAX_LENGTH = 5000;
// numeric(10, 2): at most 8 digits before the decimal point.
export const PRICE_MAX = "99999999.99";

export const PRODUCT_MESSAGES = {
  signedOut: "Your session has expired. Sign in again.",
  notStaff: "This account does not have access to the admin area.",
  unavailable: "We could not verify your access right now. Please try again.",
  notPermitted: "You are not allowed to change products.",
  loadFailed: "Could not load products. Please try again.",
  loadOneFailed: "Could not load this product. Please try again.",
  invalidProduct: "Select a valid product.",
  notFound: "This product does not exist (it may have been deleted).",
  invalidForm: "Check the highlighted fields.",
  nameRequired: "Enter a product name.",
  nameTooLong: `Use at most ${NAME_MAX_LENGTH} characters.`,
  slugInvalid:
    "Use lowercase letters, numbers and single hyphens only (for example chamomile-tea).",
  slugTooLong: `Use at most ${SLUG_MAX_LENGTH} characters.`,
  slugFromNameFailed: "Enter a slug: one could not be generated from this name.",
  slugTaken: "Another product already uses this slug. Choose a different one.",
  categoryTooLong: `Use at most ${CATEGORY_MAX_LENGTH} characters.`,
  descriptionTooLong: `Use at most ${DESCRIPTION_MAX_LENGTH} characters.`,
  priceInvalid: `Enter a price such as 6.50 (0 to ${PRICE_MAX}, at most 2 decimals), or leave it empty.`,
  saveFailed: "Could not save the product. Please try again.",
  invalidFlag: "Choose a valid change.",
  updateFailed: "Could not update the product. Please try again.",
  deleteFailed: "Could not delete the product. Please try again.",
} as const;

// Fixed notices the product list may be shown with after a redirect (?notice=...). Only
// these codes are rendered, so the query string cannot inject text into the page.
export const PRODUCT_NOTICES = {
  created: "Product created.",
  updated: "Product saved.",
} as const;

export type ProductNotice = keyof typeof PRODUCT_NOTICES;

export function productNotice(code: unknown): string | null {
  return typeof code === "string" && Object.hasOwn(PRODUCT_NOTICES, code)
    ? PRODUCT_NOTICES[code as ProductNotice]
    : null;
}

type StaffCheck = { ok: true } | { ok: false; error: string };

/** The gate for product management: Owners and Employees only. */
export function authorizeStaff(access: ProductAccess): StaffCheck {
  switch (access.status) {
    case "staff":
      return { ok: true };
    case "anonymous":
      return { ok: false, error: PRODUCT_MESSAGES.signedOut };
    case "unauthorized":
      return { ok: false, error: PRODUCT_MESSAGES.notStaff };
    case "unavailable":
      return { ok: false, error: PRODUCT_MESSAGES.unavailable };
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Same rule as the products_slug_format database constraint.
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PRICE_PATTERN = /^(\d{1,8})(?:[.,](\d{1,2}))?$/;

export function parseProductId(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

// Letters that Unicode normalization does not reduce to ASCII.
const TRANSLITERATIONS: Record<string, string> = {
  đ: "d",
  ð: "d",
  ł: "l",
  ø: "o",
  æ: "ae",
  œ: "oe",
  ß: "ss",
  þ: "th",
};

/**
 * Builds a slug from a product name: "Kamilica čaj (100 g)" -> "kamilica-caj-100-g".
 * Returns "" when nothing URL-safe remains.
 */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[đðłøæœßþ]/g, (letter) => TRANSLITERATIONS[letter])
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/^-+|-+$/g, "");
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Browsers submit "on" for a checked checkbox without a value attribute and nothing for
// an unchecked one.
function checkbox(value: unknown): boolean {
  return value === "on";
}

function formValues(fields: RawProductFields): ProductFormValues {
  return {
    name: text(fields.name),
    slug: text(fields.slug),
    description: text(fields.description),
    category: text(fields.category),
    price: text(fields.price),
    isAvailable: checkbox(fields.is_available),
    isFeatured: checkbox(fields.is_featured),
  };
}

/** Normalizes and validates a submitted product form. */
export function parseProductForm(
  fields: RawProductFields,
): { ok: true; input: ProductInput } | { ok: false; fieldErrors: FieldErrors } {
  const values = formValues(fields);
  const errors: FieldErrors = {};

  const name = values.name.trim().replace(/\s+/g, " ");
  if (!name) {
    errors.name = PRODUCT_MESSAGES.nameRequired;
  } else if (name.length > NAME_MAX_LENGTH) {
    errors.name = PRODUCT_MESSAGES.nameTooLong;
  }

  // An empty slug is generated from the name; a typed one must already be valid.
  let slug = values.slug.trim().toLowerCase();
  if (!slug) {
    slug = slugify(name);
    if (!slug && !errors.name) {
      errors.slug = PRODUCT_MESSAGES.slugFromNameFailed;
    }
  } else if (slug.length > SLUG_MAX_LENGTH) {
    errors.slug = PRODUCT_MESSAGES.slugTooLong;
  } else if (!SLUG_PATTERN.test(slug)) {
    errors.slug = PRODUCT_MESSAGES.slugInvalid;
  }

  const category = values.category.trim().replace(/\s+/g, " ");
  if (category.length > CATEGORY_MAX_LENGTH) {
    errors.category = PRODUCT_MESSAGES.categoryTooLong;
  }

  const description = values.description.replace(/\r\n?/g, "\n").trim();
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = PRODUCT_MESSAGES.descriptionTooLong;
  }

  let price: string | null = null;
  const rawPrice = values.price.trim();
  if (rawPrice) {
    const match = PRICE_PATTERN.exec(rawPrice);
    if (match) {
      // Accepts "6.5" and "6,5"; stored as "6.50".
      price = `${Number(match[1])}.${(match[2] ?? "").padEnd(2, "0")}`;
    } else {
      errors.price = PRODUCT_MESSAGES.priceInvalid;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, fieldErrors: errors };
  }

  return {
    ok: true,
    input: {
      name,
      slug,
      description: description || null,
      category: category || null,
      price,
      isAvailable: values.isAvailable,
      isFeatured: values.isFeatured,
    },
  };
}

export function isPermissionError(error: StoreError): boolean {
  return error.code === "42501" || error.status === 401 || error.status === 403;
}

function formFailure(
  fields: RawProductFields,
  error: string,
  fieldErrors: FieldErrors = {},
): ProductFormResult {
  return { ok: false, error, fieldErrors, values: formValues(fields) };
}

function saveFailure(fields: RawProductFields, error: StoreError): ProductFormResult {
  if (error.code === "23505") {
    // products_slug_key is the only unique constraint besides the primary key.
    return formFailure(fields, PRODUCT_MESSAGES.invalidForm, { slug: PRODUCT_MESSAGES.slugTaken });
  }
  if (isPermissionError(error)) {
    return formFailure(fields, PRODUCT_MESSAGES.notPermitted);
  }
  return formFailure(fields, PRODUCT_MESSAGES.saveFailed);
}

export async function listProducts(
  access: ProductAccess,
  store: ProductStore,
): Promise<{ ok: true; products: ProductSummary[] } | { ok: false; error: string }> {
  const staff = authorizeStaff(access);
  if (!staff.ok) {
    return staff;
  }
  const result = await store.list();
  return result.ok
    ? { ok: true, products: result.value }
    : { ok: false, error: PRODUCT_MESSAGES.loadFailed };
}

export async function getProduct(
  access: ProductAccess,
  store: ProductStore,
  rawId: unknown,
): Promise<{ ok: true; product: ProductDetails } | { ok: false; error: string }> {
  const staff = authorizeStaff(access);
  if (!staff.ok) {
    return staff;
  }
  const id = parseProductId(rawId);
  if (!id) {
    return { ok: false, error: PRODUCT_MESSAGES.notFound };
  }
  const result = await store.get(id);
  if (!result.ok) {
    return { ok: false, error: PRODUCT_MESSAGES.loadOneFailed };
  }
  return result.value
    ? { ok: true, product: result.value }
    : { ok: false, error: PRODUCT_MESSAGES.notFound };
}

export async function createProduct(
  access: ProductAccess,
  store: ProductStore,
  fields: RawProductFields,
): Promise<ProductFormResult> {
  const staff = authorizeStaff(access);
  if (!staff.ok) {
    return formFailure(fields, staff.error);
  }
  const parsed = parseProductForm(fields);
  if (!parsed.ok) {
    return formFailure(fields, PRODUCT_MESSAGES.invalidForm, parsed.fieldErrors);
  }
  const inserted = await store.insert(parsed.input);
  return inserted.ok ? { ok: true, id: inserted.value.id } : saveFailure(fields, inserted.error);
}

export async function updateProduct(
  access: ProductAccess,
  store: ProductStore,
  rawId: unknown,
  fields: RawProductFields,
): Promise<ProductFormResult> {
  const staff = authorizeStaff(access);
  if (!staff.ok) {
    return formFailure(fields, staff.error);
  }
  const id = parseProductId(rawId);
  if (!id) {
    return formFailure(fields, PRODUCT_MESSAGES.invalidProduct);
  }
  const parsed = parseProductForm(fields);
  if (!parsed.ok) {
    return formFailure(fields, PRODUCT_MESSAGES.invalidForm, parsed.fieldErrors);
  }
  const updated = await store.update(id, parsed.input);
  if (!updated.ok) {
    return saveFailure(fields, updated.error);
  }
  return updated.value ? { ok: true, id } : formFailure(fields, PRODUCT_MESSAGES.notFound);
}

const FLAGS: Record<string, ProductFlag> = {
  available: "is_available",
  featured: "is_featured",
};

const FLAG_MESSAGES: Record<ProductFlag, [on: string, off: string]> = {
  is_available: ["is now available", "is now unavailable"],
  is_featured: ["is now featured", "is no longer featured"],
};

/**
 * Sets (not flips) one status flag, so a repeated or stale submission cannot undo a change
 * someone else just made.
 */
export async function setProductFlag(
  access: ProductAccess,
  store: ProductStore,
  rawId: unknown,
  rawFlag: unknown,
  rawValue: unknown,
): Promise<ActionResult> {
  const staff = authorizeStaff(access);
  if (!staff.ok) {
    return staff;
  }
  const id = parseProductId(rawId);
  if (!id) {
    return { ok: false, error: PRODUCT_MESSAGES.invalidProduct };
  }
  const flag = typeof rawFlag === "string" && Object.hasOwn(FLAGS, rawFlag) ? FLAGS[rawFlag] : null;
  if (!flag || (rawValue !== "true" && rawValue !== "false")) {
    return { ok: false, error: PRODUCT_MESSAGES.invalidFlag };
  }
  const value = rawValue === "true";

  const result = await store.setFlag(id, flag, value);
  if (!result.ok) {
    return {
      ok: false,
      error: isPermissionError(result.error)
        ? PRODUCT_MESSAGES.notPermitted
        : PRODUCT_MESSAGES.updateFailed,
    };
  }
  if (!result.value) {
    return { ok: false, error: PRODUCT_MESSAGES.notFound };
  }
  return { ok: true, message: `“${result.value.name}” ${FLAG_MESSAGES[flag][value ? 0 : 1]}.` };
}

/**
 * Permanently deletes a product. There is no archive state in the schema (PROJECT.md
 * section 7): unavailable products stay public and are labelled, deleted ones are gone.
 *
 * The row is deleted first and its images afterwards. The image path comes from the deleted
 * row itself (never from the form), and only objects in the product's own folder are
 * removed. If the Storage cleanup fails, the product is still deleted (nothing references
 * the file any more) and the message says so; the failure is logged.
 */
export async function deleteProduct(
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
  const result = await store.remove(id);
  if (!result.ok) {
    return {
      ok: false,
      error: isPermissionError(result.error)
        ? PRODUCT_MESSAGES.notPermitted
        : PRODUCT_MESSAGES.deleteFailed,
    };
  }
  if (!result.value) {
    return { ok: false, error: PRODUCT_MESSAGES.notFound };
  }
  const cleaned = await removeOwnerImages(images, id, result.value.imagePath);
  return {
    ok: true,
    message: cleaned
      ? `“${result.value.name}” was deleted.`
      : `“${result.value.name}” was deleted, but its image file could not be removed from storage.`,
  };
}
