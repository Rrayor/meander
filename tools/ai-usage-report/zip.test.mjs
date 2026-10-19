import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 } from "node:zlib";

import { zipSync } from "./zip.js";

const enc = new globalThis.TextEncoder();

const fixture = () => [
  { name: "a.txt", data: enc.encode("hello") },
  { name: "dir/b.svg", data: enc.encode('<svg a="b">&amp;</svg>') },
];

const hasUnzip = (() => {
  try {
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("zipSync", () => {
  it("emits local file header and end-of-central-directory signatures", () => {
    const z = zipSync(fixture());
    assert.deepEqual([...z.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
    assert.deepEqual([...z.slice(-22, -18)], [0x50, 0x4b, 0x05, 0x06]);
  });

  it("stores data with correct CRC32", () => {
    const z = zipSync(fixture());
    const crc = crc32(enc.encode("hello")) >>> 0;
    const view = new DataView(z.buffer, z.byteOffset, z.byteLength);
    assert.equal(view.getUint32(14, true), crc);
    assert.equal(view.getUint32(18, true), 5); // compressed size (stored)
  });

  it("round-trips through unzip -p when available", { skip: !hasUnzip }, () => {
    const dir = mkdtempSync(join(tmpdir(), "zip-"));
    const p = join(dir, "t.zip");
    writeFileSync(p, zipSync(fixture()));
    const out = execFileSync("unzip", ["-p", p, "a.txt"]);
    assert.equal(out.toString(), "hello");
  });
});
