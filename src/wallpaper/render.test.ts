// Real raster integration tests: the production renderer runs against a native Canvas 2D implementation.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { defaultWallpaperSettings, type WallpaperPhoto } from "./types";
import { exportWallpaper, renderWallpaper } from "./render";
import { makeLayouts } from "./layout";
import { zipFiles } from "./zip";

vi.mock("@/lib/imageUtils", () => ({
  loadImage: async (url: string) => {
    const image = await loadImage(url);
    Object.defineProperties(image, {
      naturalWidth: { value: image.width },
      naturalHeight: { value: image.height },
    });
    return image;
  },
}));

function setupCanvas() {
  vi.stubGlobal("Blob", NodeBlob);
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag !== "canvas") return create(tag);
    const canvas = createCanvas(1, 1);
    Object.assign(canvas, {
      toBlob: (cb: (b: Blob) => void, type: string, quality: number) => {
        const ext = type.split("/")[1] as "png" | "jpeg" | "webp";
        const bytes =
          ext === "png"
            ? canvas.encodeSync("png")
            : canvas.encodeSync(ext, Math.round((quality ?? 1) * 100));
        cb(new NodeBlob([bytes], { type }) as unknown as Blob);
      },
    });
    return canvas as unknown as HTMLCanvasElement;
  });
}
function fixture(
  id: string,
  color: string,
  w = 600,
  h = 400,
  subject = true,
): WallpaperPhoto {
  const canvas = createCanvas(w, h),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  if (subject) ctx.fillRect(w * 0.8, h * 0.2, w * 0.1, h * 0.6);
  const url = canvas.toDataURL("image/png");
  return {
    id,
    name: id,
    width: w,
    height: h,
    url,
    previewUrl: url,
    blob: new Blob(),
    subjects: [],
    focus: { x: 0.85, y: 0.5 },
    protectedBox: { x: 0.8, y: 0.2, width: 0.1, height: 0.6 },
    analysis: "ready",
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("actual image export", () => {
  it("mixes both photographs symmetrically and gives the same result in reverse draw order", async () => {
    setupCanvas();
    const photos = [
      fixture("symmetric-red", "#f00", 600, 400, false),
      fixture("symmetric-blue", "#00f", 600, 400, false),
    ].map((p) => ({ ...p, protectedBox: undefined }));
    const settings = {
      ...defaultWallpaperSettings,
      width: 640,
      height: 360,
      margin: 0,
      feather: 36,
      mode: "blend" as const,
      keepSubjects: false,
    };
    const cells = [
      {
        id: photos[0].id,
        photoId: photos[0].id,
        x: 0,
        y: 0,
        width: 0.6,
        height: 1,
        rotation: 0,
      },
      {
        id: photos[1].id,
        photoId: photos[1].id,
        x: 0.4,
        y: 0,
        width: 0.6,
        height: 1,
        rotation: 0,
      },
    ];
    const a = document.createElement("canvas"),
      b = document.createElement("canvas");
    await renderWallpaper(
      a,
      photos,
      { id: "sym", name: "Symmetric", cells },
      settings,
      {},
    );
    await renderWallpaper(
      b,
      photos,
      { id: "sym", name: "Symmetric", cells: [...cells].reverse() },
      settings,
      {},
    );
    const ca = a.getContext("2d")!,
      cb = b.getContext("2d")!;
    const middle = ca.getImageData(320, 180, 1, 1).data;
    expect(Math.abs(middle[0] - middle[2])).toBeLessThan(5);
    for (let x = 258; x < 384; x += 3) {
      const p = ca.getImageData(x, 180, 1, 1).data,
        q = cb.getImageData(x, 180, 1, 1).data;
      expect(p[0] + p[2]).toBeGreaterThanOrEqual(253);
      expect(
        Math.max(...Array.from(p).map((v, i) => Math.abs(v - q[i]))),
      ).toBeLessThanOrEqual(2);
    }
  });
  it("places a whole reduced portrait against a custom color and retains the full subject", async () => {
    setupCanvas();
    const photos = [fixture("placed-portrait", "#f00", 200, 400)];
    const settings = {
      ...defaultWallpaperSettings,
      width: 800,
      height: 400,
      mode: "extend" as const,
      background: "#123456",
      extension: {
        ...defaultWallpaperSettings.extension,
        fill: "solid" as const,
        softness: 0,
      },
    };
    const layout = makeLayouts(photos, settings, 0)[0],
      key = `${layout.id}:${photos[0].id}`;
    const canvas = document.createElement("canvas");
    await renderWallpaper(canvas, photos, layout, settings, {
      [key]: {
        x: 0.5,
        y: 0.5,
        zoom: 1,
        fit: "auto",
        placement: { x: 1, y: 0.5, scale: 0.5 },
      },
    });
    const ctx = canvas.getContext("2d")!;
    expect(Array.from(ctx.getImageData(20, 200, 1, 1).data)).toEqual([
      18, 52, 86, 255,
    ]);
    expect(Array.from(ctx.getImageData(725, 200, 1, 1).data)).toEqual([
      255, 0, 0, 255,
    ]);
    expect(Array.from(ctx.getImageData(785, 200, 1, 1).data)).toEqual([
      255, 255, 255, 255,
    ]);
    expect(Array.from(ctx.getImageData(785, 270, 1, 1).data)).toEqual([
      255, 0, 0, 255,
    ]);
  });
  it.each(["texture", "blur", "color", "solid"] as const)(
    "fills the complete extension canvas using %s",
    async (fill) => {
      setupCanvas();
      const photos = [fixture(`extension-${fill}`, "#d74836", 200, 400)];
      const settings = {
        ...defaultWallpaperSettings,
        width: 800,
        height: 400,
        mode: "extend" as const,
        extension: {
          ...defaultWallpaperSettings.extension,
          fill,
          effect: "both" as const,
        },
      };
      const blob = await exportWallpaper(
        photos,
        makeLayouts(photos, settings, 0)[0],
        settings,
        {},
      );
      const decoded = await loadImage(
        new Uint8Array(await (blob as unknown as NodeBlob).arrayBuffer()),
      );
      expect([decoded.width, decoded.height]).toEqual([800, 400]);
      const canvas = createCanvas(800, 400);
      canvas.getContext("2d").drawImage(decoded, 0, 0);
      const pixels = canvas.getContext("2d").getImageData(0, 0, 800, 400).data;
      let transparent = 0;
      for (let i = 3; i < pixels.length; i += 4)
        if (pixels[i] !== 255) transparent++;
      expect(transparent).toBe(0);
    },
  );
  it("crossfades incoming photos without a dark gap between the images", async () => {
    setupCanvas();
    const photos = [
      fixture("seam-red", "#f00"),
      fixture("seam-blue", "#00f"),
    ].map((p) => ({
      ...p,
      protectedBox: undefined,
      focus: { x: 0.5, y: 0.5 },
    }));
    const settings = {
      ...defaultWallpaperSettings,
      width: 640,
      height: 360,
      margin: 0,
      feather: 10,
      mode: "blend" as const,
      keepSubjects: false,
    };
    const layout = {
      id: "seam",
      name: "Seam",
      cells: [
        {
          id: photos[0].id,
          photoId: photos[0].id,
          x: 0,
          y: 0,
          width: 0.6,
          height: 1,
          rotation: 0,
        },
        {
          id: photos[1].id,
          photoId: photos[1].id,
          x: 0.4,
          y: 0,
          width: 0.6,
          height: 1,
          rotation: 0,
        },
      ],
    };
    const canvas = document.createElement("canvas");
    await renderWallpaper(canvas, photos, layout, settings, {});
    const pixel = canvas.getContext("2d")!.getImageData(270, 180, 1, 1).data;
    expect(pixel[0]).toBeGreaterThan(20);
    expect(pixel[2]).toBeGreaterThan(20);
    expect(pixel[0] + pixel[2]).toBeGreaterThanOrEqual(250);
    expect(pixel[3]).toBe(255);
  });
  it.each(["grid", "overlap", "blend", "single"] as const)(
    "renders %s at the exact requested resolution from original sources",
    async (mode) => {
      setupCanvas();
      const photos = [
        fixture("red", "#f00"),
        fixture("blue", "#00f", 400, 600),
      ];
      const settings = {
        ...defaultWallpaperSettings,
        width: 640,
        height: 360,
        mode,
      };
      const layout = makeLayouts(photos, settings, 8)[0];
      const blob = await exportWallpaper(photos, layout, settings, {});
      const bytes = new Uint8Array(
        await (blob as unknown as NodeBlob).arrayBuffer(),
      );
      const decoded = await loadImage(bytes);
      expect(decoded.width).toBe(640);
      expect(decoded.height).toBe(360);
      expect(bytes.length).toBeGreaterThan(1000);
      const canvas = createCanvas(640, 360);
      canvas.getContext("2d").drawImage(decoded, 0, 0);
      const pixels = canvas.getContext("2d").getImageData(0, 0, 640, 360).data;
      expect(
        Array.from(pixels).filter((v, i) => i % 4 !== 3 && v > 240).length,
      ).toBeGreaterThan(5000);
    },
  );
  it.each(["png", "jpeg", "webp"] as const)(
    "encodes %s and keeps its pixel dimensions",
    async (format) => {
      setupCanvas();
      const photos = [fixture(format, "#f00")],
        settings = {
          ...defaultWallpaperSettings,
          width: 800,
          height: 600,
          format,
          mode: "single" as const,
        };
      const blob = await exportWallpaper(
        photos,
        makeLayouts(photos, settings, 0)[0],
        settings,
        {},
      );
      expect(blob.type).toBe(`image/${format}`);
      const decoded = await loadImage(
        new Uint8Array(await (blob as unknown as NodeBlob).arrayBuffer()),
      );
      expect([decoded.width, decoded.height]).toEqual([800, 600]);
    },
  );
  it("preview is the same composition as export, scaled to the preview limit", async () => {
    setupCanvas();
    const photos = [fixture("preview", "#f00")],
      settings = {
        ...defaultWallpaperSettings,
        width: 1920,
        height: 1080,
        mode: "single" as const,
        margin: 0,
      };
    const canvas = document.createElement("canvas"),
      layout = makeLayouts(photos, settings, 0)[0];
    await renderWallpaper(canvas, photos, layout, settings, {}, 960);
    expect([canvas.width, canvas.height]).toEqual([960, 540]);
    const ctx = canvas.getContext("2d")!;
    const pixel = ctx.getImageData(850, 270, 1, 1).data;
    expect(pixel[0]).toBeGreaterThan(240); // Subject stays in-frame, rather than a centre crop.
  });
  it("writes a standard ZIP with UTF-8 filenames, correct sizes and a central directory", async () => {
    vi.stubGlobal("Blob", NodeBlob);
    const bytes = new Uint8Array(
      await (
        (await zipFiles([
          { name: "tapeta-ž.png", blob: new Blob(["first"]) },
          { name: "two.jpg", blob: new Blob(["second"]) },
        ])) as unknown as NodeBlob
      ).arrayBuffer(),
    );
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(6, true)).toBe(0x800);
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(bytes.length - 12, true)).toBe(2);
    const nameLength = view.getUint16(26, true);
    expect(new TextDecoder().decode(bytes.slice(30, 30 + nameLength))).toBe(
      "tapeta-ž.png",
    );
    expect(
      new TextDecoder().decode(
        bytes.slice(30 + nameLength, 30 + nameLength + 5),
      ),
    ).toBe("first");
  });
});
