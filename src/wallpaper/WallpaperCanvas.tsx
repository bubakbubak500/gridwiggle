import { useEffect, useRef, useState } from "react";
import { clamp, frameRect, placedPhotoRect } from "./geometry";
import { adjustmentKey, renderWallpaper } from "./render";
import { defaultPlacement, type PhotoPlacement } from "./types";
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
  onPlacement,
}: {
  photos: WallpaperPhoto[];
  layout: WallpaperLayout;
  settings: WallpaperSettings;
  adjustments: Adjustments;
  thumbnail?: boolean;
  onSelect?: (id: string) => void;
  selected?: string;
  onPlacement?: (photoId: string, placement: PhotoPlacement) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const drag = useRef<{ x: number; y: number; placement: PhotoPlacement }>();
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
          if (settings.mode === "extend" && photo && onPlacement) {
            const placement =
              adjustments[adjustmentKey(layout, photo.id)]?.placement ??
              defaultPlacement;
            const placed = placedPhotoRect(photo, rect, placement);
            return (
              <button
                key={cell.id}
                className="wm-placement-handle"
                aria-label={`Posunout fotografii ${photo.name}`}
                title="Táhni fotografii pro posun. Velikost upravíš vlevo."
                style={{
                  left: `${(placed.x / settings.width) * 100}%`,
                  top: `${(placed.y / settings.height) * 100}%`,
                  width: `${(placed.width / settings.width) * 100}%`,
                  height: `${(placed.height / settings.height) * 100}%`,
                  touchAction: "none",
                }}
                onKeyDown={(e) => {
                  if (
                    ![
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                    ].includes(e.key)
                  )
                    return;
                  e.preventDefault();
                  onPlacement(photo.id, {
                    ...placement,
                    x: clamp(
                      placement.x +
                        (e.key === "ArrowRight"
                          ? 0.02
                          : e.key === "ArrowLeft"
                            ? -0.02
                            : 0),
                    ),
                    y: clamp(
                      placement.y +
                        (e.key === "ArrowDown"
                          ? 0.02
                          : e.key === "ArrowUp"
                            ? -0.02
                            : 0),
                    ),
                  });
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current = { x: e.clientX, y: e.clientY, placement };
                }}
                onPointerMove={(e) => {
                  if (!drag.current) return;
                  const canvas =
                    e.currentTarget.parentElement!.getBoundingClientRect();
                  const freeX =
                      ((rect.width - placed.width) / settings.width) *
                      canvas.width,
                    freeY =
                      ((rect.height - placed.height) / settings.height) *
                      canvas.height;
                  onPlacement(photo.id, {
                    ...drag.current.placement,
                    x:
                      freeX > 0.5
                        ? clamp(
                            drag.current.placement.x +
                              (e.clientX - drag.current.x) / freeX,
                          )
                        : placement.x,
                    y:
                      freeY > 0.5
                        ? clamp(
                            drag.current.placement.y +
                              (e.clientY - drag.current.y) / freeY,
                          )
                        : placement.y,
                  });
                }}
                onPointerUp={() => {
                  drag.current = undefined;
                }}
                onPointerCancel={() => {
                  drag.current = undefined;
                }}
              >
                <span>Táhni fotografii pro posun</span>
              </button>
            );
          }
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
