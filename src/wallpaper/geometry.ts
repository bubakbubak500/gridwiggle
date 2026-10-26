import type {
  Box,
  CropAdjustment,
  WallpaperCell,
  WallpaperPhoto,
  WallpaperSettings,
} from "./types";

export const clamp = (n: number, lo = 0, hi = 1) =>
  Math.max(lo, Math.min(hi, n));
export function outputSize(w: number, h: number, longEdge: number) {
  if (![w, h, longEdge].every((n) => Number.isFinite(n) && n > 0))
    throw new Error("Zadej kladný poměr a rozlišení.");
  return w >= h
    ? {
        width: Math.round(longEdge),
        height: Math.max(1, Math.round((longEdge * h) / w)),
      }
    : {
        width: Math.max(1, Math.round((longEdge * w) / h)),
        height: Math.round(longEdge),
      };
}
export function validateSize(width: number, height: number) {
  if (
    ![width, height].every((n) => Number.isInteger(n) && n >= 64 && n <= 16384)
  )
    return "Každá strana musí mít 64–16 384 px.";
  if (width * height > 48_000_000)
    return "Výstup může mít nejvýše 48 megapixelů. Sniž rozlišení.";
  return null;
}
export function frameRect(
  cell: WallpaperCell,
  settings: WallpaperSettings,
): Box {
  const margin = Math.min(
    settings.margin,
    Math.min(settings.width, settings.height) / 8,
  );
  const w = settings.width - margin * 2;
  const h = settings.height - margin * 2;
  const gap =
    settings.mode === "grid"
      ? Math.min(settings.gap, Math.min(cell.width * w, cell.height * h) / 3)
      : 0;
  return {
    x: margin + cell.x * w + gap / 2,
    y: margin + cell.y * h + gap / 2,
    width: Math.max(1, cell.width * w - gap),
    height: Math.max(1, cell.height * h - gap),
  };
}

/** Source rectangles stay in original-image pixels; preview and export use exactly this calculation. */
export function sourceCrop(
  photo: WallpaperPhoto,
  frame: Box,
  adjustment?: CropAdjustment,
  keepSubjects = true,
) {
  const focus = adjustment ? { x: adjustment.x, y: adjustment.y } : photo.focus;
  const zoom = adjustment?.zoom ?? 1;
  const ratio = frame.width / frame.height;
  let width = Math.min(photo.width, photo.height * ratio) / zoom;
  let height = width / ratio;
  if (height > photo.height) {
    height = photo.height / zoom;
    width = height * ratio;
  }
  const box = photo.protectedBox;
  const impossible =
    !!box &&
    (box.width * photo.width > width + 0.1 ||
      box.height * photo.height > height + 0.1);
  const contain =
    adjustment?.fit === "contain" ||
    ((adjustment?.fit ?? "auto") === "auto" && keepSubjects && impossible);
  if (contain)
    return {
      x: 0,
      y: 0,
      width: photo.width,
      height: photo.height,
      contain: true,
      clipped: false,
    };
  let x = clamp(focus.x * photo.width - width / 2, 0, photo.width - width);
  let y = clamp(focus.y * photo.height - height / 2, 0, photo.height - height);
  // Auto framing retains the whole selected subject. A manual drag is an explicit override.
  if (
    box &&
    keepSubjects &&
    (!adjustment || (adjustment.fit === "auto" && adjustment.zoom === 1)) &&
    !impossible
  ) {
    x = clamp(
      x,
      Math.max(0, (box.x + box.width) * photo.width - width),
      Math.min(box.x * photo.width, photo.width - width),
    );
    y = clamp(
      y,
      Math.max(0, (box.y + box.height) * photo.height - height),
      Math.min(box.y * photo.height, photo.height - height),
    );
  }
  const clipped =
    !!box &&
    (x > box.x * photo.width + 1 ||
      y > box.y * photo.height + 1 ||
      x + width < (box.x + box.width) * photo.width - 1 ||
      y + height < (box.y + box.height) * photo.height - 1);
  return { x, y, width, height, contain: false, clipped };
}

export function defaultAdjustment(photo: WallpaperPhoto): CropAdjustment {
  return { ...photo.focus, zoom: 1, fit: "auto" };
}
export function intersection(a: Box, b: Box) {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  );
}
