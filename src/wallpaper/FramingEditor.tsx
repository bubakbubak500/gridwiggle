import { useEffect, useRef, useState } from "react";
import { Check, Crosshair, RotateCcw, X } from "lucide-react";
import { clamp, defaultAdjustment, frameRect, sourceCrop } from "./geometry";
import { adjustmentKey } from "./render";
import { subjectFraming } from "./analysis";
import { WallpaperCanvas } from "./WallpaperCanvas";
import type {
  Adjustments,
  CropAdjustment,
  WallpaperLayout,
  WallpaperPhoto,
  WallpaperSettings,
} from "./types";

export function FramingEditor({
  photo,
  layout,
  settings,
  adjustments,
  onSave,
  onClose,
}: {
  photo: WallpaperPhoto;
  layout: WallpaperLayout;
  settings: WallpaperSettings;
  adjustments: Adjustments;
  onSave: (
    photo: WallpaperPhoto,
    adjustment: CropAdjustment | undefined,
  ) => void;
  onClose: () => void;
}) {
  const key = adjustmentKey(layout, photo.id);
  const [draft, setDraft] = useState(photo);
  const [adjustment, setAdjustment] = useState<CropAdjustment | undefined>(
    adjustments[key],
  );
  const drag = useRef<{ x: number; y: number; adjustment: CropAdjustment }>();
  const modal = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = Array.from(
        modal.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ) ?? [],
      );
      const first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleTab);
    return () => {
      document.removeEventListener("keydown", handleTab);
      previous?.focus();
    };
  }, []);
  const cell = layout.cells.find((c) => c.photoId === photo.id)!;
  const frame = frameRect(cell, settings);
  const editorSettings = {
    ...settings,
    width: Math.round(frame.width),
    height: Math.round(frame.height),
    mode: "single" as const,
    margin: 0,
    gap: 0,
  };
  const editorLayout = {
    id: layout.id,
    name: "Výřez",
    cells: [{ ...cell, x: 0, y: 0, width: 1, height: 1, rotation: 0 }],
  };
  const current = adjustment ?? defaultAdjustment(draft);
  const crop = sourceCrop(draft, frame, adjustment, settings.keepSubjects);
  const selectSubject = (index: number) => {
    const framing = subjectFraming([draft.subjects[index]]);
    setDraft({ ...draft, ...framing, analysis: "manual" });
    setAdjustment(undefined);
  };
  return (
    <div className="wm-modal-backdrop" onClick={onClose}>
      <section
        ref={modal}
        className="wm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="framing-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <header>
          <div>
            <span className="wm-eyebrow">KOMPOZICE FOTOGRAFIE</span>
            <h2 id="framing-title">Upravit výřez</h2>
            <p>{photo.name}</p>
          </div>
          <button
            className="wm-icon"
            autoFocus
            aria-label="Zavřít editor"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="wm-editor-columns">
          <div>
            <div
              className="wm-crop-drag"
              style={{ touchAction: "none" }}
              tabIndex={0}
              role="group"
              aria-label="Posun výřezu tažením nebo šipkami"
              onKeyDown={(e) => {
                if (
                  !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    e.key,
                  )
                )
                  return;
                e.preventDefault();
                setAdjustment({
                  ...current,
                  fit: "cover",
                  x: clamp(
                    current.x +
                      (e.key === "ArrowRight"
                        ? 0.01
                        : e.key === "ArrowLeft"
                          ? -0.01
                          : 0),
                  ),
                  y: clamp(
                    current.y +
                      (e.key === "ArrowDown"
                        ? 0.01
                        : e.key === "ArrowUp"
                          ? -0.01
                          : 0),
                  ),
                });
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = {
                  x: e.clientX,
                  y: e.clientY,
                  adjustment: current,
                };
              }}
              onPointerMove={(e) => {
                if (!drag.current) return;
                const rect = e.currentTarget.getBoundingClientRect();
                setAdjustment({
                  ...drag.current.adjustment,
                  fit: "cover",
                  x: clamp(
                    drag.current.adjustment.x -
                      (((e.clientX - drag.current.x) / rect.width) *
                        crop.width) /
                        draft.width,
                  ),
                  y: clamp(
                    drag.current.adjustment.y -
                      (((e.clientY - drag.current.y) / rect.height) *
                        crop.height) /
                        draft.height,
                  ),
                });
              }}
              onPointerUp={() => {
                drag.current = undefined;
              }}
              onPointerCancel={() => {
                drag.current = undefined;
              }}
            >
              <WallpaperCanvas
                photos={[draft]}
                layout={editorLayout}
                settings={editorSettings}
                adjustments={adjustment ? { [key]: adjustment } : {}}
              />
            </div>
            <p className="wm-hint">
              Táhni fotografii pro posun výřezu. Náhled má poměr její buňky v
              tapetě.
            </p>
            <label className="wm-slider-label">
              Přiblížení <strong>{current.zoom.toFixed(2)}×</strong>
              <input
                aria-label="Přiblížení fotografie"
                type="range"
                min="1"
                max="4"
                step="0.01"
                value={current.zoom}
                onChange={(e) =>
                  setAdjustment({
                    ...current,
                    fit: "cover",
                    zoom: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="wm-field">
              Zobrazení
              <select
                value={current.fit}
                onChange={(e) =>
                  setAdjustment({
                    ...current,
                    fit: e.target.value as CropAdjustment["fit"],
                  })
                }
              >
                <option value="auto">Automaticky chránit motiv</option>
                <option value="cover">Vyplnit buňku ořezem</option>
                <option value="contain">
                  Celá fotografie + rozostřené pozadí
                </option>
              </select>
            </label>
            {crop.clipped && (
              <p className="wm-warning">
                Aktuální ruční výřez zasahuje do vybraného motivu.
              </p>
            )}
            {crop.contain && (
              <p className="wm-hint">
                Zobrazuji celou fotografii, aby motiv zůstal celý.
              </p>
            )}
            <button
              className="wm-secondary"
              onClick={() => {
                setDraft(photo);
                setAdjustment(undefined);
              }}
            >
              <RotateCcw size={15} /> Obnovit automatický výřez
            </button>
          </div>
          <div>
            <h3>
              <Crosshair size={16} /> Hlavní motiv
            </h3>
            <p className="wm-hint">
              Vyber rozpoznaný objekt, nebo klikni do originálu a označ bod
              zájmu.
            </p>
            <div
              className="wm-source"
              style={{
                width: `min(100%, ${(380 * draft.width) / draft.height}px)`,
              }}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const x = clamp((e.clientX - r.left) / r.width),
                  y = clamp((e.clientY - r.top) / r.height);
                setDraft({
                  ...draft,
                  focus: { x, y },
                  protectedBox: undefined,
                  analysis: "manual",
                });
                setAdjustment(undefined);
              }}
            >
              <img
                src={draft.previewUrl}
                alt={`Originál ${photo.name}`}
                draggable={false}
              />
              {draft.subjects.map((subject, i) => (
                <button
                  key={i}
                  className="wm-subject"
                  aria-label={`Zaměřit ${subject.label} ${i + 1}`}
                  style={{
                    left: `${subject.x * 100}%`,
                    top: `${subject.y * 100}%`,
                    width: `${subject.width * 100}%`,
                    height: `${subject.height * 100}%`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectSubject(i);
                  }}
                >
                  <span>{subject.label}</span>
                </button>
              ))}
              <span
                className="wm-focus"
                style={{
                  left: `${draft.focus.x * 100}%`,
                  top: `${draft.focus.y * 100}%`,
                }}
              >
                <Crosshair size={24} />
              </span>
            </div>
            <div className="wm-subject-list">
              {draft.subjects.map((s, i) => (
                <button key={i} onClick={() => selectSubject(i)}>
                  {s.label} · {Math.round(s.score * 100)} %
                </button>
              ))}
            </div>
            {!draft.subjects.length && (
              <p className="wm-hint">
                Žádný rozpoznaný objekt. Kliknutím určíš vlastní bod zájmu.
              </p>
            )}
          </div>
        </div>
        <footer>
          <button className="wm-secondary" onClick={onClose}>
            Zrušit
          </button>
          <button
            className="wm-primary"
            onClick={() => onSave(draft, adjustment)}
          >
            <Check size={16} /> Použít výřez
          </button>
        </footer>
      </section>
    </div>
  );
}
