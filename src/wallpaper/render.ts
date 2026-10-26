import { loadImage } from "@/lib/imageUtils";
import { frameRect, sourceCrop } from "./geometry";
import { createBlendCompositor } from "./blend";
import { releaseExtensionColor, renderExtendedPhoto } from "./extension";
import type {
  Adjustments,
  WallpaperLayout,
  WallpaperPhoto,
  WallpaperSettings,
} from "./types";

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function image(url: string) {
  if (!imageCache.has(url))
    imageCache.set(
      url,
      loadImage(url).catch((error) => {
        imageCache.delete(url);
        throw error;
      }),
    );
  return imageCache.get(url)!;
}
export function releaseImage(url: string) {
  imageCache.delete(url);
  releaseExtensionColor(url);
}
export function adjustmentKey(layout: WallpaperLayout, photoId: string) {
  return `${layout.id}:${photoId}`;
}
export async function renderWallpaper(
  canvas: HTMLCanvasElement,
  photos: WallpaperPhoto[],
  layout: WallpaperLayout,
  settings: WallpaperSettings,
  adjustments: Adjustments,
  maxEdge?: number,
  cancelled?: () => boolean,
) {
  const scale = maxEdge
    ? Math.min(1, maxEdge / Math.max(settings.width, settings.height))
    : 1;
  // Render offscreen and commit atomically, avoiding stale asynchronous preview paints.
  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(settings.width * scale));
  output.height = Math.max(1, Math.round(settings.height * scale));
  const ctx = output.getContext("2d");
  if (!ctx)
    throw new Error("Prohlížeč nemůže vytvořit plátno. Zkus menší rozlišení.");
  ctx.fillStyle = settings.background;
  ctx.fillRect(0, 0, output.width, output.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const blendMask =
    settings.mode === "blend" && layout.cells.length > 1
      ? createBlendCompositor(photos, layout, settings, adjustments)
      : undefined;
  for (const cell of layout.cells) {
    if (cancelled?.()) return;
    const photo = photos.find((p) => p.id === cell.photoId);
    if (!photo) continue;
    const img = await image(maxEdge ? photo.previewUrl : photo.url);
    if (cancelled?.()) return;
    if (settings.mode === "extend") {
      renderExtendedPhoto(
        ctx,
        img,
        photo,
        settings,
        adjustments[adjustmentKey(layout, photo.id)]?.placement,
        scale,
      );
      continue;
    }
    const frame = frameRect(cell, settings);
    const crop = sourceCrop(
      photo,
      frame,
      adjustments[adjustmentKey(layout, photo.id)],
      settings.keepSubjects,
    );
    const x = frame.x * scale,
      y = frame.y * scale;
    const w = frame.width * scale,
      h = frame.height * scale;
    const layer = document.createElement("canvas");
    layer.width = Math.max(1, Math.ceil(w));
    layer.height = Math.max(1, Math.ceil(h));
    const lc = layer.getContext("2d")!;
    lc.imageSmoothingQuality = "high";
    const imageScaleX = img.naturalWidth / photo.width,
      imageScaleY = img.naturalHeight / photo.height;
    if (crop.contain) {
      const cover =
        Math.max(w / img.naturalWidth, h / img.naturalHeight) * 1.12;
      lc.filter = `blur(${Math.max(2, 18 * scale)}px) brightness(0.55)`;
      lc.drawImage(
        img,
        (w - img.naturalWidth * cover) / 2,
        (h - img.naturalHeight * cover) / 2,
        img.naturalWidth * cover,
        img.naturalHeight * cover,
      );
      lc.filter = "none";
      const fit = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      lc.drawImage(
        img,
        (w - img.naturalWidth * fit) / 2,
        (h - img.naturalHeight * fit) / 2,
        img.naturalWidth * fit,
        img.naturalHeight * fit,
      );
    } else {
      lc.drawImage(
        img,
        crop.x * imageScaleX,
        crop.y * imageScaleY,
        crop.width * imageScaleX,
        crop.height * imageScaleY,
        0,
        0,
        w,
        h,
      );
    }
    if (blendMask) {
      const mask = blendMask(cell, frame);
      lc.globalCompositeOperation = "destination-in";
      lc.drawImage(
        mask.canvas,
        mask.x * scale,
        mask.y * scale,
        mask.width * scale,
        mask.height * scale,
      );
      mask.canvas.width = mask.canvas.height = 1;
    }
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((cell.rotation * Math.PI) / 180);
    if (settings.mode === "overlap") {
      ctx.shadowColor = "#000a";
      ctx.shadowBlur = 20 * scale;
      ctx.shadowOffsetY = 5 * scale;
    }
    ctx.drawImage(layer, -w / 2, -h / 2, w, h);
    if (settings.mode === "overlap") {
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "#f5f1e6";
      ctx.lineWidth = 5 * scale;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
    layer.width = layer.height = 1;
  }
  if (cancelled?.()) return;
  canvas.width = output.width;
  canvas.height = output.height;
  canvas.getContext("2d")!.drawImage(output, 0, 0);
  output.width = output.height = 1;
}
export async function exportWallpaper(
  photos: WallpaperPhoto[],
  layout: WallpaperLayout,
  settings: WallpaperSettings,
  adjustments: Adjustments,
) {
  const canvas = document.createElement("canvas");
  await renderWallpaper(canvas, photos, layout, settings, adjustments);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(new Error("Export selhal. Zkus menší rozlišení.")),
      `image/${settings.format}`,
      settings.quality,
    ),
  );
  canvas.width = canvas.height = 1;
  const expected = `image/${settings.format}`;
  if (blob.type !== expected)
    throw new Error(
      `Prohlížeč nepodporuje ${settings.format.toUpperCase()}. Vyber PNG nebo JPEG.`,
    );
  return blob;
}
