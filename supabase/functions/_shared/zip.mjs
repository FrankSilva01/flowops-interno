const encoder = new TextEncoder();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function write16(view, offset, value) { view.setUint16(offset, value, true); }
function write32(view, offset, value) { view.setUint32(offset, value, true); }

export function createZip(entries) {
  const files = entries.map((entry) => ({
    ...entry,
    nameBytes: encoder.encode(entry.name.replaceAll("\\", "/").replace(/^\/+/, "")),
    crc: crc32(entry.bytes),
  }));
  const localSize = files.reduce((sum, file) => sum + 30 + file.nameBytes.length + file.bytes.length, 0);
  const centralSize = files.reduce((sum, file) => sum + 46 + file.nameBytes.length, 0);
  const output = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(output.buffer);
  const stamp = dosDateTime();
  let offset = 0;
  const offsets = [];

  files.forEach((file) => {
    offsets.push(offset);
    write32(view, offset, 0x04034b50); write16(view, offset + 4, 20); write16(view, offset + 6, 0x0800);
    write16(view, offset + 8, 0); write16(view, offset + 10, stamp.time); write16(view, offset + 12, stamp.date);
    write32(view, offset + 14, file.crc); write32(view, offset + 18, file.bytes.length); write32(view, offset + 22, file.bytes.length);
    write16(view, offset + 26, file.nameBytes.length); write16(view, offset + 28, 0);
    output.set(file.nameBytes, offset + 30); output.set(file.bytes, offset + 30 + file.nameBytes.length);
    offset += 30 + file.nameBytes.length + file.bytes.length;
  });

  const centralOffset = offset;
  files.forEach((file, index) => {
    write32(view, offset, 0x02014b50); write16(view, offset + 4, 20); write16(view, offset + 6, 20);
    write16(view, offset + 8, 0x0800); write16(view, offset + 10, 0); write16(view, offset + 12, stamp.time); write16(view, offset + 14, stamp.date);
    write32(view, offset + 16, file.crc); write32(view, offset + 20, file.bytes.length); write32(view, offset + 24, file.bytes.length);
    write16(view, offset + 28, file.nameBytes.length); write16(view, offset + 30, 0); write16(view, offset + 32, 0);
    write16(view, offset + 34, 0); write16(view, offset + 36, 0); write32(view, offset + 38, 0); write32(view, offset + 42, offsets[index]);
    output.set(file.nameBytes, offset + 46); offset += 46 + file.nameBytes.length;
  });

  write32(view, offset, 0x06054b50); write16(view, offset + 4, 0); write16(view, offset + 6, 0);
  write16(view, offset + 8, files.length); write16(view, offset + 10, files.length);
  write32(view, offset + 12, centralSize); write32(view, offset + 16, centralOffset); write16(view, offset + 20, 0);
  return output;
}
