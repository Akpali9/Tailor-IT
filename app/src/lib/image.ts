/** Resizes an image blob to a max edge and re-encodes as JPEG (keeps uploads small and strips EXIF location). */
export async function resizeImage(blob: Blob, maxEdge = 1600, quality = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode_failed"))), "image/jpeg", quality));
}
