export interface RgbaBitmap {
  width: number;
  height: number;
  rgba: Uint8Array;
}

const encoder = new TextEncoder();

export function buildBitmapPdf(bitmap: RgbaBitmap): Uint8Array {
  if (
    !Number.isInteger(bitmap.width) ||
    !Number.isInteger(bitmap.height) ||
    bitmap.width <= 0 ||
    bitmap.height <= 0
  ) {
    throw new Error("PDF bitmap dimensions must be positive integers.");
  }
  const expected = bitmap.width * bitmap.height * 4;
  if (bitmap.rgba.byteLength !== expected) {
    throw new Error("PDF bitmap data length does not match its dimensions.");
  }

  const chunks: Uint8Array[] = [];
  let length = 0;
  const append = (value: Uint8Array | string): void => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes);
    length += bytes.byteLength;
  };

  append("%PDF-1.4\n%Drawic\n");
  const offsets: number[] = [0];

  const addObject = (parts: Array<string | Uint8Array>): void => {
    offsets.push(length);
    append(`${offsets.length - 1} 0 obj\n`);
    for (const part of parts) {
      append(part);
    }
    append("\nendobj\n");
  };

  addObject(["<< /Type /Catalog /Pages 2 0 R >>"]);
  addObject(["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
  addObject([
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${bitmap.width} ${bitmap.height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  ]);

  const rgb = new Uint8Array(bitmap.width * bitmap.height * 3);
  for (let source = 0, target = 0; source < bitmap.rgba.length; source += 4, target += 3) {
    const alpha = bitmap.rgba[source + 3]! / 255;
    rgb[target] = Math.round(bitmap.rgba[source]! * alpha + 255 * (1 - alpha));
    rgb[target + 1] = Math.round(bitmap.rgba[source + 1]! * alpha + 255 * (1 - alpha));
    rgb[target + 2] = Math.round(bitmap.rgba[source + 2]! * alpha + 255 * (1 - alpha));
  }

  addObject([
    `<< /Type /XObject /Subtype /Image /Width ${bitmap.width} /Height ${bitmap.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${rgb.byteLength} >>\nstream\n`,
    rgb,
    "\nendstream",
  ]);

  const content = `q\n${bitmap.width} 0 0 ${bitmap.height} 0 0 cm\n/Im0 Do\nQ`;
  addObject([`<< /Length ${encoder.encode(content).byteLength} >>\nstream\n${content}\nendstream`]);

  const xrefOffset = length;
  append(`xref\n0 ${offsets.length}\n`);
  append("0000000000 65535 f \n");
  for (const offset of offsets.slice(1)) {
    append(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  append(
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  const output = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) {
    output.set(chunk, position);
    position += chunk.byteLength;
  }
  return output;
}
