const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
}

const crc32 = (buffer: Uint8Array): number => {
    let crc = 0xffffffff;
    for (let i = 0; i < buffer.length; i += 1) {
        crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
    }
    return crc ^ 0xffffffff;
};

const adler32 = (buffer: Uint8Array): number => {
    let a = 1;
    let b = 0;
    const mod = 65521;
    for (let i = 0; i < buffer.length; i += 1) {
        a = (a + buffer[i]) % mod;
        b = (b + a) % mod;
    }
    return (b << 16) | a;
};

const writeChunk = (type: string, data: Uint8Array): Uint8Array => {
    const len = data.length;
    const chunk = new Uint8Array(len + 12);
    chunk[0] = (len >>> 24) & 0xff;
    chunk[1] = (len >>> 16) & 0xff;
    chunk[2] = (len >>> 8) & 0xff;
    chunk[3] = len & 0xff;
    for (let i = 0; i < 4; i += 1) chunk[4 + i] = type.charCodeAt(i);
    chunk.set(data, 8);
    const crc = crc32(chunk.slice(4, len + 8));
    chunk[len + 8] = (crc >>> 24) & 0xff;
    chunk[len + 9] = (crc >>> 16) & 0xff;
    chunk[len + 10] = (crc >>> 8) & 0xff;
    chunk[len + 11] = crc & 0xff;
    return chunk;
};

export const encodeGrayscalePng = (
    width: number,
    height: number,
    grayscaleData: Uint8Array,
): Uint8Array => {
    const ihdr = new Uint8Array(13);
    const view = new DataView(ihdr.buffer);
    view.setUint32(0, width, false);
    view.setUint32(4, height, false);
    ihdr[8] = 8;
    ihdr[9] = 0;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const rowSize = width + 1;
    const raw = new Uint8Array(rowSize * height);
    for (let y = 0; y < height; y += 1) {
        const rowOffset = y * rowSize;
        raw[rowOffset] = 0;
        raw.set(grayscaleData.subarray(y * width, (y + 1) * width), rowOffset + 1);
    }

    const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
    let offset = 0;
    while (offset < raw.length) {
        const len = Math.min(65535, raw.length - offset);
        const isLast = offset + len >= raw.length;
        const header = new Uint8Array(5);
        header[0] = isLast ? 0x01 : 0x00;
        header[1] = len & 0xff;
        header[2] = (len >>> 8) & 0xff;
        const nlen = (~len) & 0xffff;
        header[3] = nlen & 0xff;
        header[4] = (nlen >>> 8) & 0xff;
        blocks.push(header, raw.subarray(offset, offset + len));
        offset += len;
    }

    const adler = adler32(raw);
    blocks.push(
        new Uint8Array([(adler >>> 24) & 0xff, (adler >>> 16) & 0xff, (adler >>> 8) & 0xff, adler & 0xff]),
    );

    let idatLen = 0;
    for (const b of blocks) idatLen += b.length;
    const idatData = new Uint8Array(idatLen);
    let idatOffset = 0;
    for (const b of blocks) {
        idatData.set(b, idatOffset);
        idatOffset += b.length;
    }

    const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdrChunk = writeChunk('IHDR', ihdr);
    const idatChunk = writeChunk('IDAT', idatData);
    const iendChunk = writeChunk('IEND', new Uint8Array(0));

    const output = new Uint8Array(signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
    let out = 0;
    output.set(signature, out);
    out += signature.length;
    output.set(ihdrChunk, out);
    out += ihdrChunk.length;
    output.set(idatChunk, out);
    out += idatChunk.length;
    output.set(iendChunk, out);
    return output;
};
