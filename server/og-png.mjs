import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
export const MAX_IMAGE_BYTES = 2000000;
export const MAX_REQUEST_BYTES = 3100000;
const signature = Buffer.from('89504e470d0a1a0a', 'hex');
const invalid = () => { throw Object.assign(new Error('invalid_og_image'), { status:400 }); };
// 브라우저가 만든 고정 크기 PNG만 받아요. 청크·체크섬·압축 해제 크기도 확인해요.
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function imageFields(data) {
  if (!Object.hasOwn(data, 'ogImage')) return {};
  const text = data.ogImage;
  if (typeof text !== 'string' || text.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) invalid();
  const png = Buffer.from(text, 'base64');
  if (png.length > MAX_IMAGE_BYTES || png.toString('base64') !== text || !png.subarray(0, 8).equals(signature)) invalid();
  let offset = 8, channels = 0, ended = false, idat = [];
  while (offset + 12 <= png.length) {
    const size = png.readUInt32BE(offset), end = offset + 12 + size;
    if (end > png.length) invalid();
    const type = png.toString('ascii', offset + 4, offset + 8), chunk = png.subarray(offset + 8, end - 4);
    if (crc32(png.subarray(offset + 4, end - 4)) !== png.readUInt32BE(end - 4)) invalid();
    if (offset === 8) {
      if (type !== 'IHDR' || size !== 13 || chunk.readUInt32BE(0) !== 1200 || chunk.readUInt32BE(4) !== 630 || chunk[8] !== 8 || ![2,6].includes(chunk[9]) || chunk[10] || chunk[11] || chunk[12]) invalid();
      channels = chunk[9] === 6 ? 4 : 3;
    } else if (type === 'IHDR') invalid();
    if (type === 'IDAT') idat.push(chunk);
    if (type === 'IEND') { if (size || end !== png.length || !idat.length) invalid(); ended = true; break; }
    offset = end;
  }
  if (!ended) invalid();
  const expected = (1200 * channels + 1) * 630;
  try { if (inflateSync(Buffer.concat(idat), { maxOutputLength:expected }).length !== expected) invalid(); }
  catch { invalid(); }
  return { ogImage:text, ogHash:createHash('sha256').update(png).digest('hex') };
}
