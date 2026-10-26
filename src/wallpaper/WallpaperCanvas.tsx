import { useEffect, useRef, useState } from "react";
import { frameRect } from "./geometry";
import { renderWallpaper } from "./render";
import type {
  Adjustments,
  WallpaperLayout,
  WallpaperPhoto,
  WallpaperSettings,
} from "./types";

export function WallpaperCanvas({
  photos,
  layout,
  settings,
  adjustments,
  thumbnail,
  onSelect,
  selected,
}: {
  photos: WallpaperPhoto[];
  layout: WallpaperLayout;
  settings: WallpaperSettings;
  adjustments: Adjustments;
  thumbnail?: boolean;
  onSelect?: (id: string) => void;
  selected?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setError("");
    if (ref.current)
      renderWallpaper(
        ref.current,
        photos,
        layout,
        settings,
        adjustments,
        thumbnail ? 420 : 1440,
        () => cancelled,
      ).catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [photos, layout, settings, adjustments, thumbnail]);
  return (
    <div
      className="wm-canvas"
      style={{ aspectRatio: `${settings.width}/${settings.height}` }}
    >
      <canvas
        ref={ref}
        aria-label={thumbnail ? layout.name : "Náhled tapety"}
      />
      {onSelect &&
        layout.cells.map((cell) => {
          const rect = frameRect(cell, settings);
          const photo = photos.find((p) => p.id === cell.photoId);
          return (
            <button
              key={cell.id}
              className={`wm-cell ${selected === cell.photoId ? "selected" : ""}`}
              title={`Upravit výřez: ${photo?.name}`}
              aria-label={`Upravit výřez ${photo?.name}`}
              onClick={() => onSelect(cell.photoId)}
              style={{
                left: `${(rect.x / settings.width) * 100}%`,
                top: `${(rect.y / settings.height) * 100}%`,
                width: `${(rect.width / settings.width) * 100}%`,
                height: `${(rect.height / settings.height) * 100}%`,
                transform: `rotate(${cell.rotation}deg)`,
              }}
            >
              <span>Upravit výřez</span>
            </button>
          );
        })}
      {error && (
        <div className="wm-canvas-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
