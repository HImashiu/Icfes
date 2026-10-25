// A picture the teacher chooses, shrunk in the browser to a JPEG data URL small enough to keep inside a lesson
// (at most `max` pixels on the long side). Rejects files that are not images.
export async function imageToDataUrl(file, max = 1280, quality = 0.82) {
  if (!file || !/^image\//.test(file.type)) throw new Error("Elige una imagen (JPG, PNG o WebP).");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No se pudo abrir esa imagen."));
      el.src = url;
    });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) });
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
