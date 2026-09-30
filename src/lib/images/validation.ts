// Image upload rules shared by product images (Milestone 8) and, later, promotion images
// (Milestone 9). See PROJECT.md section 6.
//
// Uploaded files are untrusted. The server accepts only JPEG, PNG and WebP up to
// IMAGE_MAX_BYTES, and decides the type from the file's first bytes (its signature), not
// from the browser-declared type or the file name. The file name is never used: object
// paths are generated here as <owner uuid>/<random uuid>.<ext>.
//
// Kept free of Next.js and "@/" imports so it runs under `npm test`.

/** 5 MiB. Same value as the buckets' file_size_limit (migration 20260930120000). */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_MAX_LABEL = "5 MB";

export const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ImageType = keyof typeof IMAGE_TYPES;

/** For the file input's accept attribute (convenience only; the server checks again). */
export const IMAGE_ACCEPT = Object.keys(IMAGE_TYPES).join(",");

export const IMAGE_BUCKETS = {
  products: "product-images",
  promotions: "promotion-images",
} as const;

export type ImageBucket = (typeof IMAGE_BUCKETS)[keyof typeof IMAGE_BUCKETS];

export const IMAGE_MESSAGES = {
  missing: "Choose an image file to upload.",
  empty: "The selected file is empty.",
  tooLarge: `The image is too large. Use a file of at most ${IMAGE_MAX_LABEL}.`,
  unsupported: "Use a JPEG, PNG or WebP image.",
  unreadable: "The file could not be read. Please try again.",
} as const;

export type ValidImage = { bytes: Uint8Array; contentType: ImageType; extension: string };

// Structural subset of File/Blob, so tests and server code can pass either.
type FileLike = { size: number; type: string; arrayBuffer(): Promise<ArrayBuffer> };

function isFileLike(value: unknown): value is FileLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as FileLike).size === "number" &&
    typeof (value as FileLike).type === "string" &&
    typeof (value as FileLike).arrayBuffer === "function"
  );
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return (
    bytes.length >= offset + signature.length &&
    signature.every((byte, index) => bytes[offset + index] === byte)
  );
}

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/** Identifies JPEG, PNG and WebP by their file signatures; null for anything else. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) {
    return "image/webp";
  }
  return null;
}

// Browsers send an empty type when they do not know it, and some tools use image/jpg.
function declaredType(type: string): string {
  const normalized = type.trim().toLowerCase();
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

/**
 * Validates a submitted file. The size is checked before the content is read. The stored
 * content type is the sniffed one, and a declared type that disagrees with the content is
 * refused.
 */
export async function validateImageFile(
  value: unknown,
): Promise<{ ok: true; image: ValidImage } | { ok: false; error: string }> {
  if (!isFileLike(value)) {
    return { ok: false, error: IMAGE_MESSAGES.missing };
  }
  // A file input left empty submits a nameless, empty file.
  const name = (value as { name?: unknown }).name;
  if (value.size === 0) {
    return {
      ok: false,
      error: typeof name === "string" && name !== "" ? IMAGE_MESSAGES.empty : IMAGE_MESSAGES.missing,
    };
  }
  if (value.size > IMAGE_MAX_BYTES) {
    return { ok: false, error: IMAGE_MESSAGES.tooLarge };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await value.arrayBuffer());
  } catch {
    return { ok: false, error: IMAGE_MESSAGES.unreadable };
  }
  // The declared size is not trusted either.
  if (bytes.length === 0) {
    return { ok: false, error: IMAGE_MESSAGES.empty };
  }
  if (bytes.length > IMAGE_MAX_BYTES) {
    return { ok: false, error: IMAGE_MESSAGES.tooLarge };
  }

  const contentType = sniffImageType(bytes);
  const declared = declaredType(value.type);
  if (!contentType || (declared !== "" && declared !== contentType)) {
    return { ok: false, error: IMAGE_MESSAGES.unsupported };
  }

  return { ok: true, image: { bytes, contentType, extension: IMAGE_TYPES[contentType] } };
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
// Same rule as the products/events image_path CHECK constraints and the Storage policies.
const OBJECT_PATH_PATTERN = new RegExp(`^(${UUID})/${UUID}\\.(jpg|png|webp)$`);
const UUID_PATTERN = new RegExp(`^${UUID}$`);

/**
 * Builds a new object path in the owner's folder: <owner uuid>/<random uuid>.<ext>.
 * `randomId` is injectable for tests.
 */
export function newImageObjectPath(
  ownerId: string,
  extension: string,
  randomId: () => string = () => globalThis.crypto.randomUUID(),
): string {
  const path = `${ownerId.toLowerCase()}/${randomId().toLowerCase()}.${extension}`;
  if (!isImageObjectPath(path, ownerId)) {
    throw new Error("Refusing to build an image path outside the convention.");
  }
  return path;
}

/**
 * True when `path` follows the convention and, if `ownerId` is given, lies in that owner's
 * folder. Used before deleting anything, so a stored value can never direct a delete
 * elsewhere.
 */
export function isImageObjectPath(path: unknown, ownerId?: string): path is string {
  if (typeof path !== "string") {
    return false;
  }
  const match = OBJECT_PATH_PATTERN.exec(path);
  if (!match) {
    return false;
  }
  return ownerId === undefined || match[1] === ownerId.toLowerCase();
}

/** The folder holding an owner's images, or null for an invalid id. */
export function imageFolder(ownerId: string): string | null {
  const id = ownerId.toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

/**
 * Public URL of an object in a public bucket, or null when the path is not a valid object
 * path (nothing is rendered for it).
 */
export function publicImageUrl(
  supabaseUrl: string,
  bucket: ImageBucket,
  path: string | null,
): string | null {
  if (!isImageObjectPath(path)) {
    return null;
  }
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/${path}`;
}
