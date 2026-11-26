/** Browser-only helper (uses canvas). */
const MAX_SIDE = 2000;

/** Phone photos are large (and sometimes HEIC): redraw as a JPEG no bigger than 2000px so it uploads fast and the AI can read it. */
export async function shrinkImage(file: File): Promise<File> {
  if (file.type === "application/pdf") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.type === "image/jpeg" && file.size < 3_000_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // the server tells the user if the type can't be read
  }
}
