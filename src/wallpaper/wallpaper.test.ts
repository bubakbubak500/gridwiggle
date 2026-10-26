import { describe, expect, it } from "vitest";
import { defaultWallpaperSettings, type WallpaperPhoto } from "./types";
import { frameRect, outputSize, sourceCrop, validateSize } from "./geometry";
import { makeLayouts } from "./layout";
import { subjectFraming } from "./analysis";

const photo = (id: string, w = 1200, h = 1800): WallpaperPhoto => ({
  id,
  name: id,
  width: w,
  height: h,
  url: "",
  previewUrl: "",
  blob: new Blob(),
  subjects: [],
  focus: { x: 0.8, y: 0.3 },
  analysis: "ready",
});
describe("exact output and protected crops", () => {
  it("resolves portrait, landscape and ultrawide ratios without stretching", () => {
    expect(outputSize(16, 9, 3840)).toEqual({ width: 3840, height: 2160 });
    expect(outputSize(2, 3, 3000)).toEqual({ width: 2000, height: 3000 });
    expect(outputSize(21, 9, 3440)).toEqual({ width: 3440, height: 1474 });
    expect(() => outputSize(0, 3, 3000)).toThrow();
    expect(validateSize(8192, 8192)).toBeTruthy();
    expect(validateSize(5120, 1440)).toBeNull();
  });
  it("keeps a right-edge subject inside a landscape crop", () => {
    const p = {
      ...photo("edge", 1800, 1200),
      protectedBox: { x: 0.75, y: 0.2, width: 0.22, height: 0.6 },
    };
    const crop = sourceCrop(p, { x: 0, y: 0, width: 1000, height: 1000 });
    expect(crop.contain).toBe(false);
    expect(crop.clipped).toBe(false);
    expect(crop.x + crop.width).toBeGreaterThanOrEqual(0.97 * p.width);
    expect(crop.width / crop.height).toBeCloseTo(1);
  });
  it("uses whole-photo fallback when a group cannot fit, and honors manual override", () => {
    const p = {
      ...photo("group"),
      protectedBox: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    };
    const frame = { x: 0, y: 0, width: 3840, height: 1080 };
    expect(sourceCrop(p, frame).contain).toBe(true);
    expect(
      sourceCrop(p, frame, { x: 0.5, y: 0.5, zoom: 2, fit: "cover" }).clipped,
    ).toBe(true);
  });
  it("bounds dragged and zoomed crops to source pixels", () => {
    const p = photo("test", 1800, 1200);
    for (const x of [-1, 0, 0.2, 1, 2])
      for (const y of [-1, 0, 1, 2]) {
        const c = sourceCrop(
          p,
          { x: 0, y: 0, width: 800, height: 400 },
          { x, y, zoom: 4, fit: "cover" },
        );
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.x + c.width).toBeLessThanOrEqual(p.width);
        expect(c.y + c.height).toBeLessThanOrEqual(p.height);
        expect(c.width / c.height).toBeCloseTo(2);
      }
  });
  it("protects multiple prominent people while excluding tiny background detections", () => {
    const frame = subjectFraming([
      {
        x: 0.05,
        y: 0.1,
        width: 0.3,
        height: 0.8,
        label: "person",
        score: 0.99,
      },
      {
        x: 0.65,
        y: 0.1,
        width: 0.3,
        height: 0.8,
        label: "person",
        score: 0.98,
      },
      { x: 0.5, y: 0, width: 0.01, height: 0.01, label: "person", score: 0.9 },
    ])!;
    expect(frame.protectedBox.x).toBeLessThan(0.05);
    expect(frame.protectedBox.x + frame.protectedBox.width).toBeGreaterThan(
      0.95,
    );
    expect(frame.protectedBox.y).toBeGreaterThan(0);
  });
  it("prioritizes foreground pets over the sofa behind them and retains both pets", () => {
    const frame = subjectFraming([
      { x: 0, y: 0, width: 1, height: 1, label: "couch", score: 1 },
      { x: 0.1, y: 0.2, width: 0.3, height: 0.6, label: "cat", score: 0.99 },
      { x: 0.6, y: 0.2, width: 0.3, height: 0.6, label: "cat", score: 0.99 },
    ])!;
    expect(frame.protectedBox.x).toBeGreaterThan(0);
    expect(frame.protectedBox.x).toBeLessThan(0.1);
    expect(frame.protectedBox.x + frame.protectedBox.width).toBeGreaterThan(
      0.9,
    );
    expect(frame.protectedBox.width).toBeLessThan(1);
  });
  it.each(["grid", "overlap", "blend"] as const)(
    "%s keeps every input exactly once inside the target canvas",
    (mode) => {
      const photos = Array.from({ length: 37 }, (_, i) =>
        photo(`photo-${i}`, i % 2 ? 1800 : 1200, i % 2 ? 1200 : 1800),
      );
      const settings = {
        ...defaultWallpaperSettings,
        mode,
        width: 5120,
        height: 1440,
      };
      const layouts = makeLayouts(photos, settings, 17);
      expect(layouts).toHaveLength(6);
      for (const layout of layouts) {
        expect(new Set(layout.cells.map((c) => c.photoId)).size).toBe(37);
        for (const c of layout.cells) {
          expect(c.x).toBeGreaterThanOrEqual(0);
          expect(c.y).toBeGreaterThanOrEqual(0);
          expect(c.x + c.width).toBeLessThanOrEqual(1.000001);
          expect(c.y + c.height).toBeLessThanOrEqual(1.000001);
          const f = frameRect(c, settings);
          expect(f.width).toBeGreaterThan(0);
          expect(f.height).toBeGreaterThan(0);
        }
      }
      expect(JSON.stringify(makeLayouts(photos, settings, 18))).not.toBe(
        JSON.stringify(layouts),
      );
    },
  );
  it("creates one standalone wallpaper per photo and preserves source order", () => {
    const photos = [photo("one"), photo("two"), photo("three")];
    const layouts = makeLayouts(
      photos,
      { ...defaultWallpaperSettings, mode: "single" },
      0,
    );
    expect(layouts.map((l) => l.cells[0].photoId)).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(layouts.every((l) => l.cells.length === 1)).toBe(true);
  });
});
