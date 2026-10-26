// ZIP STORE keeps already compressed images intact. UTF-8 names and CRC32 are standard ZIP fields.
const crcTable = Array.from({ length: 256 }, (_, i) => {
  let n = i;
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export async function zipFiles(files: { name: string; blob: Blob }[]) {
  const parts: BlobPart[] = [],
    central: BlobPart[] = [];
  let offset = 0,
    centralSize = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name),
      bytes = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(bytes),
      header = new Uint8Array(30),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x800, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, bytes.length, true);
    h.setUint32(22, bytes.length, true);
    h.setUint16(26, name.length, true);
    const entry = new Uint8Array(46),
      e = new DataView(entry.buffer);
    e.setUint32(0, 0x02014b50, true);
    e.setUint16(4, 20, true);
    e.setUint16(6, 20, true);
    e.setUint16(8, 0x800, true);
    e.setUint32(16, crc, true);
    e.setUint32(20, bytes.length, true);
    e.setUint32(24, bytes.length, true);
    e.setUint16(28, name.length, true);
    e.setUint32(42, offset, true);
    parts.push(header, name, bytes);
    central.push(entry, name);
    offset += header.length + name.length + bytes.length;
    centralSize += entry.length + name.length;
  }
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}
