import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
export const MAX_IMAGE_BYTES = 2000000;
export const MAX_REQUEST_BYTES = 3100000;
const signature = Buffer.from('89504e470d0a1a0a', 'hex');
// 브라우저가 만든 1200×630 JPEG: 표지 조각을 따라가며 크기·정밀도·색 수를 확인해요(기준선·점진 SOF).
function checkJpeg(jpg) {
  if (jpg[0] !== 0xff || jpg[1] !== 0xd8 || jpg[jpg.length - 2] !== 0xff || jpg[jpg.length - 1] !== 0xd9) invalid();
  let offset = 2, frame = false;
  while (offset + 4 <= jpg.length) {
    if (jpg[offset] !== 0xff) invalid();
    const marker = jpg[offset + 1];
    if (marker === 0xff) { offset++; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    const size = jpg.readUInt16BE(offset + 2);
    if (size < 2 || offset + 2 + size > jpg.length) invalid();
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (frame || size < 8 || jpg[offset + 4] !== 8 || jpg.readUInt16BE(offset + 5) !== 630 || jpg.readUInt16BE(offset + 7) !== 1200 || ![1, 3].includes(jpg[offset + 9])) invalid();
      frame = true;
    }
    if (marker === 0xda) { if (!frame) invalid(); return; }
    offset += 2 + size;
  }
  invalid();
}
const invalid = () => { throw Object.assign(new Error('invalid_og_image'), { status:400 }); };
// 브라우저가 만든 고정 크기 PNG·JPEG만 받아요. PNG는 청크·체크섬·압축 해제 크기도 확인해요.
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
  if (png.length > MAX_IMAGE_BYTES || png.toString('base64') !== text) invalid();
  if (png[0] === 0xff && png[1] === 0xd8) { checkJpeg(png); return { ogImage:text, ogType:'jpg', ogHash:createHash('sha256').update(png).digest('hex') }; }
  if (!png.subarray(0, 8).equals(signature)) invalid();
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
  return { ogImage:text, ogType:'png', ogHash:createHash('sha256').update(png).digest('hex') };
}
