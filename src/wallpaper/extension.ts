import { clamp, placedPhotoRect } from "./geometry";
import { smoothstep } from "./blend";
import type {
  PhotoPlacement,
  WallpaperPhoto,
  WallpaperSettings,
} from "./types";

const colors = new Map<string, string>();
export function releaseExtensionColor(url: string) {
  colors.delete(url);
}
function edgeColor(img: HTMLImageElement, url: string) {
  if (colors.has(url)) return colors.get(url)!;
  const sample = document.createElement("canvas");
  sample.width = sample.height = 40;
  const ctx = sample.getContext("2d")!;
  ctx.drawImage(img, 0, 0, 40, 40);
  const pixels = ctx.getImageData(0, 0, 40, 40).data;
  const bins = new Map<
    number,
    { count: number; r: number; g: number; b: number }
  >();
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 40; x++) {
      if (x >= 8 && x < 32 && y >= 8 && y < 32) continue;
      const i = (y * 40 + x) * 4;
      if (pixels[i + 3] < 32) continue;
      const key =
        (pixels[i] >> 5) * 64 + (pixels[i + 1] >> 5) * 8 + (pixels[i + 2] >> 5);
      const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      bin.count++;
      bin.r += pixels[i];
      bin.g += pixels[i + 1];
      bin.b += pixels[i + 2];
      bins.set(key, bin);
    }
  const dominant = [...bins.values()].sort((a, b) => b.count - a.count)[0];
  const color = dominant
    ? `rgb(${Math.round(dominant.r / dominant.count)},${Math.round(dominant.g / dominant.count)},${Math.round(dominant.b / dominant.count)})`
    : "#101318";
  colors.set(url, color);
  return color;
}

/** Reflect and stretch only edge strips; the subject is not repeated around the canvas. */
function drawEdgeTexture(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rect: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
) {
  const iw = img.naturalWidth,
    ih = img.naturalHeight,
    ex = Math.max(1, iw * 0.12),
    ey = Math.max(1, ih * 0.12);
  const xs: [number, number, number, number, boolean][] = [
    [0, rect.x, 0, ex, true],
    [rect.x, rect.width, 0, iw, false],
    [rect.x + rect.width, width - rect.x - rect.width, iw - ex, ex, true],
  ];
  const ys: [number, number, number, number, boolean][] = [
    [0, rect.y, 0, ey, true],
    [rect.y, rect.height, 0, ih, false],
    [rect.y + rect.height, height - rect.y - rect.height, ih - ey, ey, true],
  ];
  for (const [dx, dw, sx, sw, flipX] of xs)
    for (const [dy, dh, sy, sh, flipY] of ys) {
      if (dw <= 0 || dh <= 0) continue;
      ctx.save();
      ctx.translate(dx + (flipX ? dw : 0), dy + (flipY ? dh : 0));
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
      ctx.restore();
    }
}

let noiseTile: HTMLCanvasElement | undefined;
function grain() {
  if (noiseTile) return noiseTile;
  noiseTile = document.createElement("canvas");
  noiseTile.width = noiseTile.height = 128;
  const ctx = noiseTile.getContext("2d")!,
    pixels = ctx.createImageData(128, 128);
  let seed = 75629;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const n = seed >>> 24;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = n;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return noiseTile;
}

export function renderExtendedPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  photo: WallpaperPhoto,
  settings: WallpaperSettings,
  placement: PhotoPlacement | undefined,
  scale: number,
) {
  const width = ctx.canvas.width,
    height = ctx.canvas.height;
  const rect = placedPhotoRect(photo, { x: 0, y: 0, width, height }, placement);
  const extension = settings.extension;
  const base = document.createElement("canvas");
  base.width = width;
  base.height = height;
  const bc = base.getContext("2d")!;
  bc.fillStyle =
    extension.fill === "color"
      ? edgeColor(img, photo.url)
      : settings.background;
  bc.fillRect(0, 0, width, height);
  if (extension.fill === "texture")
    drawEdgeTexture(bc, img, rect, width, height);
  if (extension.fill === "blur") {
    const cover =
      Math.max(width / img.naturalWidth, height / img.naturalHeight) * 1.08;
    bc.drawImage(
      img,
      (width - img.naturalWidth * cover) / 2,
      (height - img.naturalHeight * cover) / 2,
      img.naturalWidth * cover,
      img.naturalHeight * cover,
    );
  }
  const blur =
    extension.fill === "blur" || extension.fill === "texture"
      ? (extension.blur / 100) * Math.min(width, height) * 0.09
      : 0;
  ctx.filter = blur > 0 ? `blur(${blur}px)` : "none";
  ctx.drawImage(
    base,
    -blur * 2,
    -blur * 2,
    width + blur * 4,
    height + blur * 4,
  );
  ctx.filter = "none";
  base.width = base.height = 1;

  const layer = document.createElement("canvas");
  layer.width = Math.max(1, Math.ceil(rect.width));
  layer.height = Math.max(1, Math.ceil(rect.height));
  const lc = layer.getContext("2d")!;
  lc.imageSmoothingQuality = "high";
  lc.drawImage(img, 0, 0, layer.width, layer.height);
  const fade = (extension.softness / 100) * Math.min(layer.width, layer.height);
  if (fade > 0) {
    const mask = document.createElement("canvas"),
      ms = Math.min(1, 1024 / Math.max(layer.width, layer.height));
    mask.width = Math.max(1, Math.round(layer.width * ms));
    mask.height = Math.max(1, Math.round(layer.height * ms));
    const mc = mask.getContext("2d")!,
      pixels = mc.createImageData(mask.width, mask.height);
    for (let y = 0; y < mask.height; y++)
      for (let x = 0; x < mask.width; x++) {
        const px = ((x + 0.5) / mask.width) * layer.width,
          py = ((y + 0.5) / mask.height) * layer.height;
        const left = rect.x < 0.5 ? 1 : smoothstep(px / fade),
          right =
            rect.x + rect.width > width - 0.5
              ? 1
              : smoothstep((layer.width - px) / fade);
        const top = rect.y < 0.5 ? 1 : smoothstep(py / fade),
          bottom =
            rect.y + rect.height > height - 0.5
              ? 1
              : smoothstep((layer.height - py) / fade);
        let alpha = left * right * top * bottom;
        if (settings.keepSubjects && photo.protectedBox) {
          const box = photo.protectedBox,
            nx = px / layer.width,
            ny = py / layer.height;
          const d = Math.hypot(
            Math.max(box.x - nx, 0, nx - box.x - box.width),
            Math.max(box.y - ny, 0, ny - box.y - box.height),
          );
          alpha = Math.max(alpha, 1 - smoothstep(d / 0.035));
        }
        const i = (y * mask.width + x) * 4;
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
        pixels.data[i + 3] = Math.round(clamp(alpha) * 255);
      }
    mc.putImageData(pixels, 0, 0);
    lc.globalCompositeOperation = "destination-in";
    lc.drawImage(mask, 0, 0, layer.width, layer.height);
    mask.width = mask.height = 1;
  }
  ctx.drawImage(layer, rect.x, rect.y, rect.width, rect.height);
  layer.width = layer.height = 1;
  if (extension.effect === "grain" || extension.effect === "both") {
    ctx.save();
    const unit = Math.max(
      0.25,
      (Math.min(settings.width, settings.height) / 900) * scale,
    );
    ctx.scale(unit, unit);
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = ctx.createPattern(grain(), "repeat")!;
    ctx.fillRect(0, 0, width / unit, height / unit);
    ctx.restore();
  }
  if (extension.effect === "vignette" || extension.effect === "both") {
    const gradient = ctx.createRadialGradient(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      Math.min(width, height) * 0.2,
      width / 2,
      height / 2,
      Math.hypot(width, height) * 0.6,
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,0.48)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
}
