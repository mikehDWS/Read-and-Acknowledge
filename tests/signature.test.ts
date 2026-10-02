import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { readSignature } from "@/lib/signature";

// A real 40x10 white PNG, so the check sees a genuine image.
function tinyPng(): string {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(40, 0);
  ihdr.writeUInt32BE(10, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((40 * 3 + 1) * 10, 0xff);
  for (let y = 0; y < 10; y++) raw[y * 121] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return "data:image/png;base64," + png.toString("base64");
}

describe("readSignature", () => {
  it("accepts a drawn PNG signature", () => {
    const sig = readSignature(tinyPng(), "drawn", "");
    expect(typeof sig).toBe("object");
    if (typeof sig === "object") {
      expect(sig.method).toBe("drawn");
      expect(sig.typedName).toBeNull();
      expect(sig.png.subarray(1, 4).toString()).toBe("PNG");
    }
  });

  it("accepts a typed signature with the name typed", () => {
    const sig = readSignature(tinyPng(), "typed", "  Sam Patel ");
    expect(typeof sig === "object" && sig.typedName).toBe("Sam Patel");
  });

  it("refuses a missing, empty or fake signature", () => {
    expect(readSignature("", "drawn", "")).toMatch(/Sign in the box/);
    expect(readSignature(tinyPng(), "typed", " ")).toMatch(/Type your full name/);
    expect(readSignature("data:image/png;base64," + Buffer.from("not a png at all".repeat(10)).toString("base64"), "drawn", "")).toMatch(/couldn't be read/);
    expect(readSignature("data:image/svg+xml;base64,PHN2Zz4=", "drawn", "")).toMatch(/Sign in the box/);
    expect(readSignature(tinyPng(), "stamped", "")).toMatch(/Sign in the box/);
  });

  it("refuses an oversized image", () => {
    expect(readSignature("data:image/png;base64," + "A".repeat(400_000), "drawn", "")).toMatch(/too large/);
  });
});
