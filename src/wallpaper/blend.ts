import { clamp, frameRect, sourceCrop } from "./geometry";
import type {
  Adjustments,
  Box,
  WallpaperCell,
  WallpaperLayout,
  WallpaperPhoto,
  WallpaperSettings,
} from "./types";

export const smoothstep = (t: number) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};
function subjectRect(
  photo: WallpaperPhoto,
  frame: Box,
  crop: ReturnType<typeof sourceCrop>,
): Box | undefined {
  if (!photo.protectedBox) return;
  const box = photo.protectedBox;
  const scale = crop.contain
    ? Math.min(frame.width / photo.width, frame.height / photo.height)
    : frame.width / crop.width;
  const dx = crop.contain
    ? (frame.width - photo.width * scale) / 2
    : -crop.x * scale;
  const dy = crop.contain
    ? (frame.height - photo.height * scale) / 2
    : -crop.y * scale;
  return {
    x: frame.x + dx + box.x * photo.width * scale,
    y: frame.y + dy + box.y * photo.height * scale,
    width: box.width * photo.width * scale,
    height: box.height * photo.height * scale,
  };
}
function influence(box: Box, x: number, y: number, padding: number) {
  const dx = Math.max(box.x - x, 0, x - box.x - box.width);
  const dy = Math.max(box.y - y, 0, y - box.y - box.height);
  return 1 - smoothstep(Math.hypot(dx, dy) / padding);
}

/**
 * A symmetric weighted blend: every photo fades on all internal edges.
 * Alpha_i = weight_i / running_weight_sum produces sum(weight * color) / sum(weight).
 * Unlike independently fading two source-over layers, this neither darkens the seam nor favors draw order.
 * Smooth masks share a global, bounded grid; original-resolution image pixels are never downsampled.
 */
export function createBlendCompositor(
  photos: WallpaperPhoto[],
  layout: WallpaperLayout,
  settings: WallpaperSettings,
  adjustments: Adjustments,
) {
  const gridScale = Math.min(
    1,
    1024 / Math.max(settings.width, settings.height),
  );
  const width = Math.max(1, Math.round(settings.width * gridScale)),
    height = Math.max(1, Math.round(settings.height * gridScale));
  const sx = settings.width / width,
    sy = settings.height / height;
  const sums = new Float32Array(width * height);
  const fade = Math.max(
    1,
    (settings.feather / 100) * Math.min(settings.width, settings.height),
  );
  const protectedAreas = settings.keepSubjects
    ? layout.cells.flatMap((cell) => {
        const photo = photos.find((p) => p.id === cell.photoId);
        if (!photo) return [];
        const frame = frameRect(cell, settings),
          crop = sourceCrop(
            photo,
            frame,
            adjustments[`${layout.id}:${photo.id}`],
            true,
          );
        const box = subjectRect(photo, frame, crop);
        return box ? [{ id: photo.id, box }] : [];
      })
    : [];
  return (cell: WallpaperCell, frame: Box) => {
    const left = Math.max(0, Math.floor(frame.x / sx)),
      top = Math.max(0, Math.floor(frame.y / sy));
    const right = Math.min(width, Math.ceil((frame.x + frame.width) / sx)),
      bottom = Math.min(height, Math.ceil((frame.y + frame.height) / sy));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, right - left);
    canvas.height = Math.max(1, bottom - top);
    const ctx = canvas.getContext("2d")!,
      pixels = ctx.createImageData(canvas.width, canvas.height);
    const fadeX = Math.min(fade, frame.width * 0.8),
      fadeY = Math.min(fade, frame.height * 0.8);
    const outer = {
      left: cell.x <= 0.000001,
      top: cell.y <= 0.000001,
      right: cell.x + cell.width >= 0.999999,
      bottom: cell.y + cell.height >= 0.999999,
    };
    for (let gy = top; gy < bottom; gy++)
      for (let gx = left; gx < right; gx++) {
        const x = (gx + 0.5) * sx,
          y = (gy + 0.5) * sy;
        let weight =
          x >= frame.x &&
          x <= frame.x + frame.width &&
          y >= frame.y &&
          y <= frame.y + frame.height
            ? 1
            : 0;
        if (!outer.left) weight *= smoothstep((x - frame.x) / fadeX);
        if (!outer.right)
          weight *= smoothstep((frame.x + frame.width - x) / fadeX);
        if (!outer.top) weight *= smoothstep((y - frame.y) / fadeY);
        if (!outer.bottom)
          weight *= smoothstep((frame.y + frame.height - y) / fadeY);
        if (weight > 0) {
          let own = 0,
            others = 1;
          for (const area of protectedAreas) {
            const strength = influence(
              area.box,
              x,
              y,
              Math.max(1, fade * 0.35),
            );
            if (area.id === cell.photoId) own = Math.max(own, strength);
            else others *= 1 - 0.97 * strength;
          }
          // Protection changes relative importance without cancelling the edge fade itself.
          weight *= (1 + 3 * own) * others;
        }
        const index = gy * width + gx,
          total = sums[index] + weight;
        const i = ((gy - top) * canvas.width + gx - left) * 4;
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
        pixels.data[i + 3] = total > 0 ? Math.round((weight / total) * 255) : 0;
        sums[index] = total;
      }
    ctx.putImageData(pixels, 0, 0);
    return {
      canvas,
      x: left * sx - frame.x,
      y: top * sy - frame.y,
      width: canvas.width * sx,
      height: canvas.height * sy,
    };
  };
}
