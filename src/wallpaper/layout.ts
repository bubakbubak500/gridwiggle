import { clamp, frameRect, intersection, sourceCrop } from "./geometry";
import type {
  Box,
  WallpaperCell,
  WallpaperLayout,
  WallpaperPhoto,
  WallpaperSettings,
} from "./types";

function random(seed: number) {
  let state = seed | 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}
function aspect(photo: WallpaperPhoto) {
  // Framing edits must not reshuffle the layout underneath the editor.
  return photo.width / photo.height;
}
function cost(photo: WallpaperPhoto, rect: Box, ratio: number) {
  return Math.abs(
    Math.log(((rect.width / rect.height) * ratio) / aspect(photo)),
  );
}

/** Fixed-canvas binary packing. The split direction is scored against the actual input orientations. */
function pack(
  photos: WallpaperPhoto[],
  rect: Box,
  ratio: number,
  rng: () => number,
  depth = 0,
): WallpaperCell[] {
  if (photos.length === 1)
    return [{ ...rect, id: photos[0].id, photoId: photos[0].id, rotation: 0 }];
  const split = Math.max(
    1,
    Math.min(
      photos.length - 1,
      Math.round(
        photos.length / 2 + (rng() - 0.5) * Math.min(3, photos.length / 2),
      ),
    ),
  );
  const left = photos.slice(0, split),
    right = photos.slice(split);
  const fraction = clamp(
    split / photos.length + (rng() - 0.5) * 0.12,
    0.22,
    0.78,
  );
  const variants: [Box, Box][] = [
    [
      { ...rect, width: rect.width * fraction },
      {
        ...rect,
        x: rect.x + rect.width * fraction,
        width: rect.width * (1 - fraction),
      },
    ],
    [
      { ...rect, height: rect.height * fraction },
      {
        ...rect,
        y: rect.y + rect.height * fraction,
        height: rect.height * (1 - fraction),
      },
    ],
  ];
  const scores = variants.map(([a, b]) => {
    const approximate = (items: WallpaperPhoto[], r: Box) => {
      const target = Math.sqrt(items.length);
      const tile = { ...r, width: r.width / target, height: r.height / target };
      return items.reduce((n, p) => n + cost(p, tile, ratio), 0) / items.length;
    };
    return (
      approximate(left, a) +
      approximate(right, b) +
      rng() * (depth < 2 ? 0.8 : 0.2)
    );
  });
  const [a, b] = variants[scores[0] <= scores[1] ? 0 : 1];
  return [
    ...pack(left, a, ratio, rng, depth + 1),
    ...pack(right, b, ratio, rng, depth + 1),
  ];
}

function protectedProjection(
  photo: WallpaperPhoto,
  cell: WallpaperCell,
  settings: WallpaperSettings,
): Box | undefined {
  if (!photo.protectedBox) return;
  const frame = frameRect(cell, settings);
  const crop = sourceCrop(photo, frame, undefined, true);
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

export function makeLayouts(
  photos: WallpaperPhoto[],
  settings: WallpaperSettings,
  seed: number,
): WallpaperLayout[] {
  if (!photos.length) return [];
  if (settings.mode === "single" || settings.mode === "extend")
    return photos.map((p, i) => ({
      id: `${settings.mode}-${p.id}`,
      name: `Tapeta ${i + 1}`,
      cells: [
        {
          id: p.id,
          photoId: p.id,
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          rotation: 0,
        },
      ],
    }));
  return Array.from({ length: 6 }, (_, variant) => {
    const rng = random(seed * 9137 + variant * 101 + 7);
    const shuffled = [...photos];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    let cells = pack(
      shuffled,
      { x: 0, y: 0, width: 1, height: 1 },
      settings.width / settings.height,
      rng,
    );
    if (settings.mode !== "grid" && photos.length > 1) {
      const transition =
        (settings.feather / 100) * Math.min(settings.width, settings.height);
      const expansionX =
        settings.mode === "blend" ? transition / (2 * settings.width) : 0.035;
      const expansionY =
        settings.mode === "blend" ? transition / (2 * settings.height) : 0.035;
      cells = cells.map((cell) => {
        let expanded = {
          ...cell,
          x: Math.max(0, cell.x - expansionX),
          y: Math.max(0, cell.y - expansionY),
          width:
            Math.min(1, cell.x + cell.width + expansionX) -
            Math.max(0, cell.x - expansionX),
          height:
            Math.min(1, cell.y + cell.height + expansionY) -
            Math.max(0, cell.y - expansionY),
        };
        // Keep neighbouring subjects clear of overlaid cards. Rotation is only used without protection.
        if (settings.keepSubjects && settings.mode === "overlap") {
          for (const other of cells) {
            if (other.photoId === cell.photoId) continue;
            const photo = photos.find((p) => p.id === other.photoId)!;
            const protectedRect = protectedProjection(photo, other, settings);
            if (
              protectedRect &&
              intersection(frameRect(expanded, settings), protectedRect) > 0
            ) {
              expanded = cell;
              break;
            }
          }
        } else if (settings.mode === "overlap")
          expanded.rotation = (rng() - 0.5) * 8;
        return expanded;
      });
    }
    return {
      id: `${settings.mode}-${seed}-${variant}`,
      name: `Návrh ${variant + 1}`,
      cells,
    };
  });
}
