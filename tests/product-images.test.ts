// Unit tests for image storage (src/lib/images/) and staff product image management
// (src/lib/products/images.ts, image cleanup in deleteProduct). Run with `npm test`.
//
// In-memory fakes (tests/support/fakes.ts) stand in for the products table and one Storage
// bucket. They record every call, so the tests can assert what was (not) uploaded or
// deleted. Storage RLS itself is tested against PostgreSQL (see PROJECT.md, Milestone 8).

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  createSupabaseImageStorage,
  imageIssueLog,
  removeOwnerImages,
  type ImageIssue,
} from "../src/lib/images/storage.ts";
import {
  IMAGE_ACCEPT,
  IMAGE_BUCKETS,
  IMAGE_MAX_BYTES,
  IMAGE_MESSAGES,
  isImageObjectPath,
  newImageObjectPath,
  publicImageUrl,
  sniffImageType,
  validateImageFile,
  type ValidImage,
} from "../src/lib/images/validation.ts";
import {
  PRODUCT_IMAGE_MESSAGES,
  removeProductImage,
  setProductImage,
} from "../src/lib/products/images.ts";
import {
  PRODUCT_MESSAGES,
  deleteProduct,
  updateProduct,
  type ProductAccess,
  type ProductInput,
} from "../src/lib/products/management.ts";
import { createSupabaseProductStore } from "../src/lib/products/supabase-store.ts";

import { FakeImageStorage, FakeStore } from "./support/fakes.ts";

const TEA_ID = "10000000-0000-4000-8000-000000000001";
const BALM_ID = "10000000-0000-4000-8000-000000000002";
const MISSING_ID = "10000000-0000-4000-8000-0000000000ff";
const OLD_TEA_IMAGE = `${TEA_ID}/40000000-0000-4000-8000-000000000001.jpg`;
const BALM_IMAGE = `${BALM_ID}/40000000-0000-4000-8000-000000000002.png`;

const owner: ProductAccess = { status: "staff", user: { id: "00000000-0000-4000-8000-000000000001", role: "owner" } };
const employee: ProductAccess = { status: "staff", user: { id: "00000000-0000-4000-8000-000000000002", role: "employee" } };
const staff: [string, ProductAccess][] = [
  ["owner", owner],
  ["employee", employee],
];
const nonStaff: [string, ProductAccess, string][] = [
  ["anonymous", { status: "anonymous" }, PRODUCT_MESSAGES.signedOut],
  ["authenticated without a role", { status: "unauthorized" }, PRODUCT_MESSAGES.notStaff],
  ["role lookup failed", { status: "unavailable" }, PRODUCT_MESSAGES.unavailable],
];

const TEA: ProductInput = {
  name: "Chamomile Tea",
  slug: "chamomile-tea",
  description: null,
  category: "Teas",
  price: "6.50",
  isAvailable: true,
  isFeatured: false,
};
const BALM: ProductInput = { ...TEA, name: "Herbal Balm", slug: "herbal-balm" };

// Minimal valid file headers (the server checks signatures, not full decodability).
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
const bytesOf = (text: string) => [...text].map((char) => char.charCodeAt(0));
const WEBP = [...bytesOf("RIFF"), 0x24, 0x00, 0x00, 0x00, ...bytesOf("WEBPVP8 ")];
const GIF = bytesOf("GIF89a\x01\x00\x01\x00");
const SVG = bytesOf('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

function file(bytes: number[], name = "photo.jpg", type = "image/jpeg") {
  return new File([new Uint8Array(bytes)], name, { type });
}

// Deterministic "random" object ids.
let counter = 0;
const nextRandomId = () => `30000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

let store: FakeStore;
let images: FakeImageStorage;
let issues: [ImageIssue, unknown][];
const originalReport = imageIssueLog.report;

beforeEach(() => {
  counter = 0;
  store = new FakeStore();
  store.add(TEA_ID, TEA);
  store.add(BALM_ID, BALM, BALM_IMAGE);
  images = new FakeImageStorage();
  images.objects.set(BALM_IMAGE, "image/png");
  issues = [];
  imageIssueLog.report = (issue, detail) => void issues.push([issue, detail]);
});

afterEach(() => {
  imageIssueLog.report = originalReport;
});

function upload(access: ProductAccess, id: unknown, value: unknown = file(JPEG)) {
  return setProductImage(access, store, images, id, value, nextRandomId);
}

// ---------------------------------------------------------------------------------------
// Validation

describe("validateImageFile", () => {
  it("accepts JPEG, PNG and WebP and uses the type found in the content", async () => {
    const cases: [number[], string, string, string][] = [
      [JPEG, "a.jpg", "image/jpeg", "jpg"],
      [PNG, "a.png", "image/png", "png"],
      [WEBP, "a.webp", "image/webp", "webp"],
      [JPEG, "a.jpg", "image/jpg", "jpg"], // non-standard alias
      [PNG, "a", "", "png"], // browser did not know the type
    ];
    for (const [bytes, name, type, extension] of cases) {
      const result = await validateImageFile(file(bytes, name, type));
      assert.ok(result.ok, `${name} ${type}`);
      assert.equal(result.image.extension, extension);
      assert.deepEqual([...result.image.bytes], bytes);
    }
  });

  it("refuses unsupported types, whatever the name or declared type says", async () => {
    const cases: [number[], string, string][] = [
      [GIF, "a.gif", "image/gif"],
      [SVG, "a.svg", "image/svg+xml"],
      [SVG, "a.png", "image/png"], // SVG renamed to .png
      [bytesOf("MZ\x90\x00 executable"), "a.jpg", "image/jpeg"],
      [bytesOf("%PDF-1.7"), "a.webp", "image/webp"],
      [bytesOf("just text"), "a.txt", "text/plain"],
      [JPEG, "a.png", "image/png"], // declared type disagrees with the content
      [PNG, "a.png", "application/octet-stream"],
    ];
    for (const [bytes, name, type] of cases) {
      assert.deepEqual(await validateImageFile(file(bytes, name, type)), {
        ok: false,
        error: IMAGE_MESSAGES.unsupported,
      }, `${name} ${type}`);
    }
  });

  it("refuses missing and empty files", async () => {
    for (const value of [null, undefined, "", "photo.jpg", 42, {}]) {
      assert.deepEqual(await validateImageFile(value), { ok: false, error: IMAGE_MESSAGES.missing });
    }
    // An untouched file input submits a nameless empty file.
    assert.deepEqual(await validateImageFile(new File([], "", { type: "application/octet-stream" })), {
      ok: false,
      error: IMAGE_MESSAGES.missing,
    });
    assert.deepEqual(await validateImageFile(file([], "empty.jpg")), {
      ok: false,
      error: IMAGE_MESSAGES.empty,
    });
  });

  it("refuses oversized files before reading them", async () => {
    let read = false;
    const huge = {
      name: "huge.jpg",
      type: "image/jpeg",
      size: IMAGE_MAX_BYTES + 1,
      arrayBuffer: async () => ((read = true), new ArrayBuffer(0)),
    };
    assert.deepEqual(await validateImageFile(huge), { ok: false, error: IMAGE_MESSAGES.tooLarge });
    assert.equal(read, false);

    const exact = new Uint8Array(IMAGE_MAX_BYTES);
    exact.set(JPEG);
    assert.equal((await validateImageFile(new File([exact], "max.jpg", { type: "image/jpeg" }))).ok, true);
    const over = new Uint8Array(IMAGE_MAX_BYTES + 1);
    over.set(JPEG);
    assert.deepEqual(await validateImageFile(new File([over], "over.jpg", { type: "image/jpeg" })), {
      ok: false,
      error: IMAGE_MESSAGES.tooLarge,
    });
  });

  it("does not trust the declared size", async () => {
    const lying = {
      name: "a.jpg",
      type: "image/jpeg",
      size: 10,
      arrayBuffer: async () => new Uint8Array([...JPEG, ...new Array(IMAGE_MAX_BYTES).fill(0)]).buffer,
    };
    assert.deepEqual(await validateImageFile(lying), { ok: false, error: IMAGE_MESSAGES.tooLarge });
  });

  it("reports unreadable files with a fixed message", async () => {
    const broken = {
      name: "a.jpg",
      type: "image/jpeg",
      size: 10,
      arrayBuffer: async () => {
        throw new Error("stream error with internal details");
      },
    };
    assert.deepEqual(await validateImageFile(broken), { ok: false, error: IMAGE_MESSAGES.unreadable });
  });

  it("sniffs signatures only at the start of the content", () => {
    assert.equal(sniffImageType(new Uint8Array([0x00, ...JPEG])), null);
    assert.equal(sniffImageType(new Uint8Array(bytesOf("RIFF1234WAVE"))), null);
    assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8])), null);
    assert.equal(IMAGE_ACCEPT, "image/jpeg,image/png,image/webp");
  });
});

// ---------------------------------------------------------------------------------------
// Object paths

describe("object paths", () => {
  it("are generated as <owner uuid>/<random uuid>.<ext>", () => {
    assert.equal(
      newImageObjectPath(TEA_ID.toUpperCase(), "png", () => "ABCDEF00-0000-4000-8000-000000000001"),
      `${TEA_ID}/abcdef00-0000-4000-8000-000000000001.png`,
    );
    const random = newImageObjectPath(TEA_ID, "webp");
    assert.ok(isImageObjectPath(random, TEA_ID), random);
    assert.notEqual(newImageObjectPath(TEA_ID, "webp"), random);
  });

  it("refuse to build anything outside the convention", () => {
    assert.throws(() => newImageObjectPath(TEA_ID, "png", () => "../../x"));
    assert.throws(() => newImageObjectPath("../other", "png"));
    assert.throws(() => newImageObjectPath(TEA_ID, "svg"));
  });

  it("are recognized strictly, optionally within one owner's folder", () => {
    assert.equal(isImageObjectPath(OLD_TEA_IMAGE), true);
    assert.equal(isImageObjectPath(OLD_TEA_IMAGE, TEA_ID), true);
    assert.equal(isImageObjectPath(OLD_TEA_IMAGE, BALM_ID), false);
    for (const path of [
      null,
      "",
      "photo.jpg",
      `${TEA_ID}/photo.jpg`,
      `${TEA_ID}/../${BALM_IMAGE}`,
      `../${OLD_TEA_IMAGE}`,
      `/${OLD_TEA_IMAGE}`,
      `${OLD_TEA_IMAGE}/x`,
      OLD_TEA_IMAGE.replace(".jpg", ".svg"),
      OLD_TEA_IMAGE.replace(".jpg", ".JPG"),
      `${TEA_ID}/${TEA_ID}/40000000-0000-4000-8000-000000000001.jpg`,
      `${OLD_TEA_IMAGE}\n`,
    ]) {
      assert.equal(isImageObjectPath(path), false, String(path));
    }
  });

  it("build public URLs only for valid paths", () => {
    assert.equal(
      publicImageUrl("https://ref.supabase.co/", IMAGE_BUCKETS.products, OLD_TEA_IMAGE),
      `https://ref.supabase.co/storage/v1/object/public/product-images/${OLD_TEA_IMAGE}`,
    );
    assert.equal(publicImageUrl("https://ref.supabase.co", IMAGE_BUCKETS.products, null), null);
    assert.equal(publicImageUrl("https://ref.supabase.co", IMAGE_BUCKETS.products, "../secret"), null);
  });
});

// ---------------------------------------------------------------------------------------
// Authorization

describe("callers without a staff role", () => {
  for (const [name, access, error] of nonStaff) {
    it(`${name}: cannot upload, replace, remove or delete images and never reach the stores`, async () => {
      assert.deepEqual(await upload(access, TEA_ID), { ok: false, error });
      assert.deepEqual(await upload(access, BALM_ID), { ok: false, error }); // replace
      assert.deepEqual(await removeProductImage(access, store, images, BALM_ID), { ok: false, error });
      assert.deepEqual(await deleteProduct(access, store, images, BALM_ID), { ok: false, error });

      assert.deepEqual(store.calls, []);
      assert.deepEqual(images.calls, []);
      assert.deepEqual([...images.objects.keys()], [BALM_IMAGE]);
      assert.equal(store.products.get(BALM_ID)?.imagePath, BALM_IMAGE);
      assert.equal(store.products.get(TEA_ID)?.imagePath, null);
    });
  }
});

// ---------------------------------------------------------------------------------------
// Product integration

describe("setProductImage", () => {
  for (const [name, access] of staff) {
    it(`${name}: attaches an image to a product without one`, async () => {
      assert.deepEqual(await upload(access, TEA_ID, file(PNG, "Tea.png", "image/png")), {
        ok: true,
        message: PRODUCT_IMAGE_MESSAGES.saved,
      });
      const path = `${TEA_ID}/30000000-0000-4000-8000-000000000001.png`;
      assert.equal(store.products.get(TEA_ID)?.imagePath, path);
      assert.equal(images.objects.get(path), "image/png");
      assert.deepEqual(images.calls, [["upload", path, "image/png"]]);
    });
  }

  it("replaces an image: new object referenced, old object deleted", async () => {
    assert.equal((await upload(employee, BALM_ID, file(WEBP, "new.webp", "image/webp"))).ok, true);
    const path = `${BALM_ID}/30000000-0000-4000-8000-000000000001.webp`;
    assert.equal(store.products.get(BALM_ID)?.imagePath, path);
    assert.deepEqual([...images.objects.keys()], [path]);
    assert.deepEqual(images.calls, [
      ["upload", path, "image/webp"],
      ["remove", [BALM_IMAGE]],
    ]);
    // Upload strictly before the reference changes, the old file only afterwards.
    assert.deepEqual(store.calls, ["get", "setImagePath"]);
  });

  it("never lets the file name influence the object path", async () => {
    for (const name of ["../../../etc/passwd.png", `${BALM_ID}/x.png`, "a/b\\c.png", "%2e%2e%2fx.png", ""]) {
      images = new FakeImageStorage();
      store.products.get(TEA_ID)!.imagePath = null;
      assert.equal((await upload(owner, TEA_ID, file(PNG, name, "image/png"))).ok, true, name);
      const [[, path]] = images.calls as [[string, string]];
      assert.ok(isImageObjectPath(path, TEA_ID), path);
      assert.ok(!path.includes(".."), path);
    }
    // BALM's image was never touched.
    assert.equal(store.products.get(BALM_ID)?.imagePath, BALM_IMAGE);
  });

  it("validates the file before touching anything", async () => {
    for (const [value, error] of [
      [null, IMAGE_MESSAGES.missing],
      [file([], "e.jpg"), IMAGE_MESSAGES.empty],
      [file(GIF, "a.gif", "image/gif"), IMAGE_MESSAGES.unsupported],
    ] as const) {
      assert.deepEqual(await upload(owner, TEA_ID, value), { ok: false, error });
    }
    assert.deepEqual(store.calls, []);
    assert.deepEqual(images.calls, []);
  });

  it("refuses invalid and unknown products without uploading", async () => {
    for (const id of ["*", "../x", null, `${TEA_ID}/../x`]) {
      assert.deepEqual(await upload(owner, id), { ok: false, error: PRODUCT_MESSAGES.invalidProduct });
    }
    assert.deepEqual(store.calls, []);
    assert.deepEqual(await upload(owner, MISSING_ID), { ok: false, error: PRODUCT_MESSAGES.notFound });
    store.failures.get = { code: "57014" };
    assert.deepEqual(await upload(owner, TEA_ID), { ok: false, error: PRODUCT_MESSAGES.loadOneFailed });
    assert.deepEqual(images.calls, []);
  });
});

describe("removeProductImage", () => {
  it("clears the reference, then deletes the file", async () => {
    assert.deepEqual(await removeProductImage(employee, store, images, BALM_ID), {
      ok: true,
      message: PRODUCT_IMAGE_MESSAGES.removed,
    });
    assert.equal(store.products.get(BALM_ID)?.imagePath, null);
    assert.equal(images.objects.size, 0);
    assert.deepEqual(store.calls, ["get", "setImagePath"]);
    assert.deepEqual(images.calls, [["remove", [BALM_IMAGE]]]);
  });

  it("reports products without an image, invalid and unknown ids", async () => {
    assert.deepEqual(await removeProductImage(owner, store, images, TEA_ID), {
      ok: false,
      error: PRODUCT_IMAGE_MESSAGES.noImage,
    });
    assert.deepEqual(await removeProductImage(owner, store, images, "x"), {
      ok: false,
      error: PRODUCT_MESSAGES.invalidProduct,
    });
    assert.deepEqual(await removeProductImage(owner, store, images, MISSING_ID), {
      ok: false,
      error: PRODUCT_MESSAGES.notFound,
    });
    assert.deepEqual(images.calls, []);
  });

  it("keeps the image when clearing the reference fails", async () => {
    store.failures.setImagePath = { code: "42501", status: 403 };
    assert.deepEqual(await removeProductImage(owner, store, images, BALM_ID), {
      ok: false,
      error: PRODUCT_IMAGE_MESSAGES.notPermitted,
    });
    store.failures.setImagePath = { code: "08006" };
    assert.deepEqual(await removeProductImage(owner, store, images, BALM_ID), {
      ok: false,
      error: PRODUCT_IMAGE_MESSAGES.removeFailed,
    });
    assert.equal(store.products.get(BALM_ID)?.imagePath, BALM_IMAGE);
    assert.deepEqual(images.calls, []);
  });

  it("still succeeds when the file cannot be deleted afterwards", async () => {
    images.failures.remove = { status: 500 };
    assert.deepEqual(await removeProductImage(owner, store, images, BALM_ID), {
      ok: true,
      message: PRODUCT_IMAGE_MESSAGES.removedFileNotDeleted,
    });
    assert.equal(store.products.get(BALM_ID)?.imagePath, null);
    assert.deepEqual(issues.map(([issue]) => issue), ["old_image_cleanup_failed"]);
  });
});

describe("existing products without images", () => {
  it("can still be edited, and editing never touches the image", async () => {
    const fields = { name: "Chamomile Tea", slug: "chamomile-tea", is_available: "on" };
    assert.deepEqual(await updateProduct(owner, store, TEA_ID, fields), { ok: true, id: TEA_ID });
    assert.equal(store.products.get(TEA_ID)?.imagePath, null);
    assert.deepEqual(await updateProduct(owner, store, BALM_ID, { ...fields, slug: "herbal-balm" }), {
      ok: true,
      id: BALM_ID,
    });
    assert.equal(store.products.get(BALM_ID)?.imagePath, BALM_IMAGE);
    assert.deepEqual(images.calls, []);
  });
});

describe("deleteProduct image cleanup", () => {
  it("deletes the product's image and leftovers in its folder, nothing else", async () => {
    const leftover = `${BALM_ID}/40000000-0000-4000-8000-0000000000aa.webp`;
    images.objects.set(leftover, "image/webp");
    images.objects.set(OLD_TEA_IMAGE, "image/jpeg"); // another product's folder
    assert.deepEqual(await deleteProduct(employee, store, images, BALM_ID), {
      ok: true,
      message: "“Herbal Balm” was deleted.",
    });
    assert.equal(store.products.has(BALM_ID), false);
    assert.deepEqual([...images.objects.keys()], [OLD_TEA_IMAGE]);
    assert.deepEqual(images.calls, [
      ["list", BALM_ID],
      ["remove", [BALM_IMAGE, leftover]],
    ]);
  });

  it("deletes a product without an image without deleting anything else", async () => {
    assert.equal((await deleteProduct(owner, store, images, TEA_ID)).ok, true);
    assert.deepEqual(images.calls, [["list", TEA_ID]]);
    assert.deepEqual([...images.objects.keys()], [BALM_IMAGE]);
  });

  it("still deletes the product when the image file cannot be removed", async () => {
    images.failures.remove = { status: 503 };
    assert.deepEqual(await deleteProduct(owner, store, images, BALM_ID), {
      ok: true,
      message: "“Herbal Balm” was deleted, but its image file could not be removed from storage.",
    });
    assert.equal(store.products.has(BALM_ID), false);
    assert.deepEqual(issues.map(([issue]) => issue), ["owner_cleanup_failed"]);
  });

  it("removes the stored image even if the folder cannot be listed", async () => {
    images.failures.list = { status: 500 };
    assert.deepEqual(await deleteProduct(owner, store, images, BALM_ID), {
      ok: true,
      message: "“Herbal Balm” was deleted.",
    });
    assert.equal(images.objects.size, 0);
  });

  it("touches no file when the product row could not be deleted", async () => {
    store.failures.remove = { code: "42501", status: 403 };
    assert.deepEqual(await deleteProduct(owner, store, images, BALM_ID), {
      ok: false,
      error: PRODUCT_MESSAGES.notPermitted,
    });
    assert.deepEqual(await deleteProduct(owner, store, images, MISSING_ID), {
      ok: false,
      error: PRODUCT_MESSAGES.notPermitted,
    });
    store.failures = {};
    assert.deepEqual(await deleteProduct(owner, store, images, MISSING_ID), {
      ok: false,
      error: PRODUCT_MESSAGES.notFound,
    });
    assert.deepEqual(images.calls, []);
    assert.ok(images.objects.has(BALM_IMAGE));
  });

  it("never deletes outside the product's folder, even if the stored path points elsewhere", async () => {
    // Only possible by bypassing the image_path CHECK constraint; defended anyway.
    store.products.get(TEA_ID)!.imagePath = BALM_IMAGE;
    assert.equal((await deleteProduct(owner, store, images, TEA_ID)).ok, true);
    assert.ok(images.objects.has(BALM_IMAGE));
    assert.deepEqual(images.calls, [["list", TEA_ID]]);
  });
});

// ---------------------------------------------------------------------------------------
// Partial failures

describe("partial failures during upload/replacement", () => {
  it("upload fails: nothing changes", async () => {
    images.failures.upload = { status: 500, code: "500" };
    assert.deepEqual(await upload(owner, BALM_ID), { ok: false, error: PRODUCT_IMAGE_MESSAGES.uploadFailed });
    images.failures.upload = { status: 403, code: "403" };
    assert.deepEqual(await upload(owner, BALM_ID), { ok: false, error: PRODUCT_IMAGE_MESSAGES.notPermitted });
    assert.deepEqual(store.calls, ["get", "get"]);
    assert.equal(store.products.get(BALM_ID)?.imagePath, BALM_IMAGE);
    assert.deepEqual([...images.objects.keys()], [BALM_IMAGE]);
    assert.deepEqual(issues.map(([issue]) => issue), ["upload_failed", "upload_failed"]);
  });

  it("upload succeeds but the database update fails: the new file is discarded, the old image stays", async () => {
    store.failures.setImagePath = { code: "08006" };
    assert.deepEqual(await upload(owner, BALM_ID), { ok: false, error: PRODUCT_IMAGE_MESSAGES.saveFailed });
    const path = `${BALM_ID}/30000000-0000-4000-8000-000000000001.jpg`;
    assert.deepEqual(images.calls, [
      ["upload", path, "image/jpeg"],
      ["remove", [path]],
    ]);
    assert.equal(store.products.get(BALM_ID)?.imagePath, BALM_IMAGE);
    assert.deepEqual([...images.objects.keys()], [BALM_IMAGE]);

    store.failures.setImagePath = { code: "42501", status: 403 };
    assert.deepEqual(await upload(owner, BALM_ID), { ok: false, error: PRODUCT_IMAGE_MESSAGES.notPermitted });
    assert.deepEqual([...images.objects.keys()], [BALM_IMAGE]);
  });

  it("database update and the discard both fail: the orphan is logged, the old image stays", async () => {
    store.failures.setImagePath = { code: "08006" };
    images.failures.remove = { status: 500 };
    assert.deepEqual(await upload(owner, BALM_ID), { ok: false, error: PRODUCT_IMAGE_MESSAGES.saveFailed });
    assert.equal(store.products.get(BALM_ID)?.imagePath, BALM_IMAGE);
    assert.deepEqual(issues.map(([issue]) => issue), ["reference_update_failed", "orphaned_upload"]);
  });

  it("the product changed or was deleted meanwhile: the new file is discarded", async () => {
    const concurrent = `${BALM_ID}/40000000-0000-4000-8000-0000000000bb.png`;
    store.beforeSetImagePath = () => {
      store.products.get(BALM_ID)!.imagePath = concurrent;
    };
    assert.deepEqual(await upload(owner, BALM_ID), { ok: false, error: PRODUCT_IMAGE_MESSAGES.changed });
    assert.equal(store.products.get(BALM_ID)?.imagePath, concurrent);
    // The old image was not deleted either: the concurrent writer owns the cleanup.
    assert.deepEqual([...images.objects.keys()], [BALM_IMAGE]);

    store.beforeSetImagePath = () => store.products.delete(TEA_ID);
    assert.deepEqual(await upload(owner, TEA_ID), { ok: false, error: PRODUCT_IMAGE_MESSAGES.changed });
    assert.deepEqual([...images.objects.keys()], [BALM_IMAGE]);
  });

  it("old-image cleanup fails: the replacement still succeeds", async () => {
    const realRemove = images.remove.bind(images);
    images.remove = async (paths) =>
      paths.includes(BALM_IMAGE) ? { ok: false, error: { status: 500 } } : realRemove(paths);
    assert.deepEqual(await upload(owner, BALM_ID), {
      ok: true,
      message: PRODUCT_IMAGE_MESSAGES.savedOldNotRemoved,
    });
    const path = `${BALM_ID}/30000000-0000-4000-8000-000000000001.jpg`;
    assert.equal(store.products.get(BALM_ID)?.imagePath, path);
    assert.ok(images.objects.has(path));
    assert.deepEqual(issues, [["old_image_cleanup_failed", { path: BALM_IMAGE, error: { status: 500 } }]]);
  });

  it("the old image is already missing from storage: the replacement succeeds normally", async () => {
    images.objects.clear();
    assert.deepEqual(await upload(owner, BALM_ID), { ok: true, message: PRODUCT_IMAGE_MESSAGES.saved });
    assert.deepEqual(issues, []);
  });

  it("never deletes a stored path outside the product's folder", async () => {
    store.products.get(TEA_ID)!.imagePath = BALM_IMAGE; // bypasses the CHECK constraint
    assert.equal((await upload(owner, TEA_ID)).ok, true);
    assert.ok(images.objects.has(BALM_IMAGE));
    assert.equal((await removeProductImage(owner, store, images, BALM_ID)).ok, true);
  });
});

describe("removeOwnerImages", () => {
  it("refuses an invalid owner id", async () => {
    assert.equal(await removeOwnerImages(images, "../x", BALM_IMAGE), false);
    assert.deepEqual(images.calls, []);
  });
});

// ---------------------------------------------------------------------------------------
// Adapters

function fakeStorageClient(result: { data: unknown; error: unknown } | Error) {
  const calls: unknown[][] = [];
  const respond = async () => {
    if (result instanceof Error) throw result;
    return result;
  };
  const bucket = {
    upload: (...args: unknown[]) => (calls.push(["upload", ...args]), respond()),
    remove: (...args: unknown[]) => (calls.push(["remove", ...args]), respond()),
    list: (...args: unknown[]) => (calls.push(["list", ...args]), respond()),
  };
  const client = { storage: { from: (name: string) => (calls.push(["from", name]), bucket) } };
  return {
    client: client as unknown as Parameters<typeof createSupabaseImageStorage>[0],
    calls,
  };
}

const IMAGE: ValidImage = { bytes: new Uint8Array(PNG), contentType: "image/png", extension: "png" };

describe("createSupabaseImageStorage", () => {
  it("uploads to the fixed bucket without overwriting, with the sniffed content type", async () => {
    const { client, calls } = fakeStorageClient({ data: { path: "x" }, error: null });
    const storage = createSupabaseImageStorage(client, IMAGE_BUCKETS.products);
    assert.deepEqual(await storage.upload(OLD_TEA_IMAGE, IMAGE), { ok: true, value: null });
    assert.deepEqual(calls, [
      ["from", "product-images"],
      ["upload", OLD_TEA_IMAGE, IMAGE.bytes, { contentType: "image/png", cacheControl: "86400", upsert: false }],
    ]);
  });

  it("removes and lists objects", async () => {
    let fake = fakeStorageClient({ data: [{ name: OLD_TEA_IMAGE }], error: null });
    let storage = createSupabaseImageStorage(fake.client, IMAGE_BUCKETS.promotions);
    assert.deepEqual(await storage.remove([OLD_TEA_IMAGE]), { ok: true, value: [OLD_TEA_IMAGE] });
    assert.deepEqual(fake.calls, [["from", "promotion-images"], ["remove", [OLD_TEA_IMAGE]]]);
    assert.deepEqual(await storage.remove([]), { ok: true, value: [] });

    fake = fakeStorageClient({ data: [{ name: "40000000-0000-4000-8000-000000000001.jpg" }], error: null });
    storage = createSupabaseImageStorage(fake.client, IMAGE_BUCKETS.products);
    assert.deepEqual(await storage.list(TEA_ID), { ok: true, value: [OLD_TEA_IMAGE] });
    assert.deepEqual(fake.calls[1], ["list", TEA_ID, { limit: 100 }]);
  });

  it("keeps only the status/code of errors, and catches thrown errors", async () => {
    const error = {
      name: "StorageApiError",
      message: "new row violates row-level security policy",
      status: 403,
      statusCode: "403",
      stack: "internal",
    };
    let storage = createSupabaseImageStorage(fakeStorageClient({ data: null, error }).client, IMAGE_BUCKETS.products);
    assert.deepEqual(await storage.upload(OLD_TEA_IMAGE, IMAGE), { ok: false, error: { status: 403, code: "403" } });
    assert.deepEqual(await storage.remove([OLD_TEA_IMAGE]), { ok: false, error: { status: 403, code: "403" } });
    assert.deepEqual(await storage.list(TEA_ID), { ok: false, error: { status: 403, code: "403" } });

    storage = createSupabaseImageStorage(fakeStorageClient(new Error("fetch failed: secret")).client, IMAGE_BUCKETS.products);
    assert.deepEqual(await storage.upload(OLD_TEA_IMAGE, IMAGE), { ok: false, error: { status: undefined, code: undefined } });
  });
});

function fakeDbClient(result: { data: unknown; error: unknown }) {
  const calls: unknown[][] = [];
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const name of ["select", "update", "delete", "eq", "is", "order"]) {
    chain[name] = (...args) => (calls.push([name, ...args]), chain);
  }
  chain.then = (resolve: unknown) => Promise.resolve(result).then(resolve as (v: unknown) => unknown);
  const client = { from: (table: string) => (calls.push(["from", table]), chain) };
  return { client: client as unknown as Parameters<typeof createSupabaseProductStore>[0], calls };
}

describe("createSupabaseProductStore image columns", () => {
  it("sets image_path with a compare-and-set on the previous value", async () => {
    let fake = fakeDbClient({ data: [{ id: TEA_ID }], error: null });
    assert.deepEqual(await createSupabaseProductStore(fake.client).setImagePath(TEA_ID, OLD_TEA_IMAGE, null), {
      ok: true,
      value: true,
    });
    assert.deepEqual(fake.calls, [
      ["from", "products"],
      ["update", { image_path: OLD_TEA_IMAGE }],
      ["eq", "id", TEA_ID],
      ["is", "image_path", null],
      ["select", "id"],
    ]);

    fake = fakeDbClient({ data: [], error: null });
    assert.deepEqual(await createSupabaseProductStore(fake.client).setImagePath(TEA_ID, null, OLD_TEA_IMAGE), {
      ok: true,
      value: false,
    });
    assert.deepEqual(fake.calls.slice(1), [
      ["update", { image_path: null }],
      ["eq", "id", TEA_ID],
      ["eq", "image_path", OLD_TEA_IMAGE],
      ["select", "id"],
    ]);
  });

  it("never writes image_path from the product form", async () => {
    const fake = fakeDbClient({ data: [{ id: TEA_ID }], error: null });
    await createSupabaseProductStore(fake.client).update(TEA_ID, TEA);
    const [, [, row]] = fake.calls as [unknown, [string, Record<string, unknown>]];
    assert.equal("image_path" in row, false);
  });

  it("reads the stored image path", async () => {
    const fake = fakeDbClient({
      data: [{ id: TEA_ID, name: "Chamomile Tea", slug: "chamomile-tea", image_path: OLD_TEA_IMAGE, updated_at: "x" }],
      error: null,
    });
    const list = await createSupabaseProductStore(fake.client).list();
    assert.ok(list.ok);
    assert.equal(list.value[0].imagePath, OLD_TEA_IMAGE);
    assert.match(String(fake.calls[1][1]), /\bimage_path\b/);
  });
});
