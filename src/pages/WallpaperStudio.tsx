import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  Crosshair,
  Download,
  Grid2X2,
  ImagePlus,
  Images,
  Layers,
  Loader2,
  Monitor,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { createDisplayPreview, loadImage } from "@/lib/imageUtils";
import { downloadBlob } from "@/lib/exportCollage";
import {
  analyzePhoto,
  cancelAnalysis,
  estimateFocus,
  subjectFraming,
} from "@/wallpaper/analysis";
import {
  frameRect,
  outputSize,
  sourceCrop,
  validateSize,
} from "@/wallpaper/geometry";
import { makeLayouts } from "@/wallpaper/layout";
import {
  adjustmentKey,
  exportWallpaper,
  releaseImage,
} from "@/wallpaper/render";
import { loadProject, saveProject } from "@/wallpaper/storage";
import { zipFiles } from "@/wallpaper/zip";
import { WallpaperCanvas } from "@/wallpaper/WallpaperCanvas";
import { FramingEditor } from "@/wallpaper/FramingEditor";
import {
  defaultWallpaperSettings,
  type Adjustments,
  type WallpaperMode,
  type WallpaperPhoto,
  type WallpaperSettings,
} from "@/wallpaper/types";
import "@/wallpaper/wallpaper.css";

const modes: {
  id: WallpaperMode;
  label: string;
  detail: string;
  icon: typeof Grid2X2;
}[] = [
  {
    id: "grid",
    label: "Dlaždice",
    detail: "Čisté linie a mezery",
    icon: Grid2X2,
  },
  {
    id: "overlap",
    label: "Překryvy",
    detail: "Fotografie přes sebe",
    icon: Layers,
  },
  {
    id: "blend",
    label: "Prolnutí",
    detail: "Měkké přechody",
    icon: WandSparkles,
  },
  {
    id: "single",
    label: "Samostatně",
    detail: "Jedna fotka, jedna tapeta",
    icon: Images,
  },
];
const presets = [
  ["Full HD", 1920, 1080],
  ["QHD", 2560, 1440],
  ["4K UHD", 3840, 2160],
  ["Ultrawide", 3440, 1440],
  ["5K ultrawide", 5120, 2160],
  ["Na výšku", 2160, 3840],
] as const;
const extension = (format: WallpaperSettings["format"]) =>
  format === "jpeg" ? "jpg" : format;

export default function WallpaperStudio() {
  const [photos, setPhotos] = useState<WallpaperPhoto[]>([]);
  const [settings, setSettings] = useState(defaultWallpaperSettings);
  const [adjustments, setAdjustments] = useState<Adjustments>({});
  const [seed, setSeed] = useState(1);
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState<string>();
  const [busy, setBusy] = useState("");
  const [aiStatus, setAiStatus] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [autoAI, setAutoAI] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [readyDownload, setReadyDownload] = useState<{
    url: string;
    name: string;
  }>();
  const [restored, setRestored] = useState(false);
  const [storageStatus, setStorageStatus] = useState("");
  const [sizeMode, setSizeMode] = useState<"pixels" | "ratio">("pixels");
  const [ratio, setRatio] = useState({ w: 16, h: 9, edge: 3840 });
  const input = useRef<HTMLInputElement>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const alive = useRef(true);
  const urls = useRef(new Set<string>());
  const aiRunning = useRef(false);
  const aiGeneration = useRef(0);
  const importRunning = useRef(false);
  let validSize = validateSize(settings.width, settings.height);
  if (sizeMode === "ratio") {
    try {
      const target = outputSize(ratio.w, ratio.h, ratio.edge);
      validSize = validateSize(target.width, target.height);
    } catch {
      validSize = "Zadej kladný poměr stran a délku delší strany.";
    }
  }
  const layouts = useMemo(
    () => makeLayouts(photos, settings, seed),
    [photos, settings, seed],
  );
  const layout = layouts[Math.min(selected, layouts.length - 1)];
  const editedPhoto = photos.find((p) => p.id === editing);
  const update = (patch: Partial<WallpaperSettings>) =>
    setSettings((s) => ({ ...s, ...patch }));

  useEffect(() => {
    alive.current = true;
    loadProject()
      .then(async (project) => {
        if (!project || !alive.current) return;
        if (validateSize(project.settings.width, project.settings.height))
          return;
        const restoredPhotos = await Promise.all(
          project.photos.map(async (p) => {
            const url = URL.createObjectURL(p.blob);
            urls.current.add(url);
            const preview = await createDisplayPreview(p.blob, 1600);
            urls.current.add(preview.url);
            return {
              ...p,
              url,
              previewUrl: preview.url,
              analysis:
                p.analysis === "pending" ? ("fallback" as const) : p.analysis,
            };
          }),
        );
        if (alive.current) {
          setPhotos(restoredPhotos);
          setSettings({ ...defaultWallpaperSettings, ...project.settings });
          setSeed(project.seed);
          setAdjustments(project.adjustments);
        }
      })
      .catch(() => {
        if (alive.current)
          setStorageStatus(
            "Automatické ukládání není v tomto prohlížeči dostupné.",
          );
      })
      .finally(() => {
        if (alive.current) setRestored(true);
      });
    return () => {
      alive.current = false;
      aiGeneration.current++;
      cancelAnalysis();
      for (const url of urls.current) {
        URL.revokeObjectURL(url);
        releaseImage(url);
      }
      urls.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!restored) return;
    const timer = setTimeout(() => {
      saveProject({
        photos: photos.map(({ url: _url, previewUrl: _preview, ...p }) => p),
        settings,
        adjustments,
        seed,
      })
        .then(() => {
          if (alive.current)
            setStorageStatus("Projekt uložený v tomto prohlížeči");
        })
        .catch(() => {
          if (alive.current)
            setStorageStatus(
              "Projekt se nepodařilo uložit. Úložiště může být plné.",
            );
        });
    }, 700);
    return () => clearTimeout(timer);
  }, [photos, settings, adjustments, seed, restored]);

  const runAI = useCallback(async (items: WallpaperPhoto[]) => {
    if (aiRunning.current || !items.length) return;
    aiRunning.current = true;
    setAiBusy(true);
    const generation = ++aiGeneration.current;
    let available = true;
    for (let i = 0; i < items.length; i++) {
      if (!alive.current || generation !== aiGeneration.current) break;
      const p = items[i];
      if (!photosRef.current.some((current) => current.id === p.id)) continue;
      if (!available) {
        setPhotos((current) =>
          current.map((photo) =>
            photo.id === p.id && photo.analysis !== "manual"
              ? { ...photo, analysis: "fallback" }
              : photo,
          ),
        );
        continue;
      }
      setAiStatus(`Fotografie ${i + 1}/${items.length}: hledám motiv…`);
      try {
        const subjects = await analyzePhoto(p, (status) => {
          if (
            alive.current &&
            generation === aiGeneration.current &&
            !status.startsWith("[diag]")
          )
            setAiStatus(`Fotografie ${i + 1}/${items.length} · ${status}`);
        });
        if (!alive.current || generation !== aiGeneration.current) break;
        setPhotos((current) =>
          current.map((photo) =>
            photo.id === p.id
              ? {
                  ...photo,
                  subjects,
                  ...(photo.analysis !== "manual"
                    ? {
                        ...subjectFraming(subjects),
                        analysis: subjects.length
                          ? ("ready" as const)
                          : ("fallback" as const),
                      }
                    : {}),
                }
              : photo,
          ),
        );
      } catch (e) {
        if (!alive.current || generation !== aiGeneration.current) break;
        available = false;
        if (alive.current) {
          setNotice(
            `AI není dostupná: ${e instanceof Error ? e.message : "Analýza selhala."} Používám odhad podle obrazu; motiv můžeš označit ručně.`,
          );
          setPhotos((current) =>
            current.map((photo) =>
              photo.id === p.id && photo.analysis !== "manual"
                ? { ...photo, analysis: "fallback" }
                : photo,
            ),
          );
        }
      }
    }
    aiRunning.current = false;
    if (alive.current) {
      setAiBusy(false);
      setAiStatus("");
    }
  }, []);

  useEffect(() => {
    const pending = photos.filter((p) => p.analysis === "pending");
    if (autoAI && !aiBusy && !aiRunning.current && pending.length)
      void runAI(pending);
  }, [photos, autoAI, aiBusy, runAI]);

  const importFiles = useCallback(
    async (files: File[]) => {
      if (importRunning.current) return;
      importRunning.current = true;
      setError("");
      setNotice("");
      setBusy("Načítám fotografie…");
      const added: WallpaperPhoto[] = [],
        failed: string[] = [];
      const capacity = Math.max(0, 100 - photosRef.current.length);
      try {
        for (const file of files.slice(0, capacity)) {
          if (file.size > 60 * 1024 * 1024) {
            failed.push(`${file.name} (soubor přesahuje 60 MB)`);
            continue;
          }
          const url = URL.createObjectURL(file);
          urls.current.add(url);
          try {
            const img = await loadImage(url);
            const preview = await createDisplayPreview(file, 1600);
            urls.current.add(preview.url);
            added.push({
              id: crypto.randomUUID(),
              name: file.name,
              blob: file,
              url,
              previewUrl: preview.url,
              width: img.naturalWidth,
              height: img.naturalHeight,
              subjects: [],
              focus: estimateFocus(img),
              analysis: autoAI ? "pending" : "fallback",
            });
          } catch {
            failed.push(file.name);
            URL.revokeObjectURL(url);
            urls.current.delete(url);
          }
        }
        if (alive.current) {
          // Keep the ref current before starting inference, including fast cached-model responses.
          photosRef.current = [...photosRef.current, ...added];
          setPhotos(photosRef.current);
          setSelected(0);
          if (failed.length)
            setError(
              `Nelze načíst: ${failed.join(", ")}. Podporované jsou formáty, které prohlížeč umí otevřít, například JPEG, PNG a WebP.`,
            );
          if (files.length > capacity)
            setNotice("V jednom projektu může být nejvýše 100 fotografií.");
        }
      } finally {
        importRunning.current = false;
        if (alive.current) setBusy("");
      }
    },
    [autoAI],
  );

  async function handleExport(all: boolean) {
    if (validSize || !layout) return;
    setError("");
    const targets = all ? layouts : [layout];
    try {
      const files: { name: string; blob: Blob }[] = [];
      for (let i = 0; i < targets.length; i++) {
        setBusy(`Exportuji ${i + 1}/${targets.length}…`);
        const blob = await exportWallpaper(
          photos,
          targets[i],
          settings,
          adjustments,
        );
        files.push({
          name: `tapeta-${String(i + 1).padStart(2, "0")}-${settings.width}x${settings.height}.${extension(settings.format)}`,
          blob,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const blob = all ? await zipFiles(files) : files[0].blob;
      const name = all
        ? `gridwiggle-${settings.width}x${settings.height}.zip`
        : files[0].name;
      if (readyDownload) {
        URL.revokeObjectURL(readyDownload.url);
        urls.current.delete(readyDownload.url);
      }
      const url = URL.createObjectURL(blob);
      urls.current.add(url);
      setReadyDownload({ url, name });
      downloadBlob(blob, name);
      setNotice(
        all
          ? `Připraven ZIP s ${files.length} tapetami.`
          : "Tapeta je připravená ke stažení.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export se nezdařil.");
    } finally {
      setBusy("");
    }
  }

  function applyRatio(next: typeof ratio) {
    setRatio(next);
    try {
      const size = outputSize(next.w, next.h, next.edge);
      if (!validateSize(size.width, size.height)) {
        update(size);
        setError("");
      } else setError(validateSize(size.width, size.height)!);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const warnings =
    layout?.cells.flatMap((cell) => {
      const photo = photos.find((p) => p.id === cell.photoId)!;
      const frame = frameRect(cell, settings),
        crop = sourceCrop(
          photo,
          frame,
          adjustments[adjustmentKey(layout, photo.id)],
          settings.keepSubjects,
        );
      return crop.clipped
        ? [`${photo.name}: ruční výřez zasahuje do motivu.`]
        : !crop.contain &&
            (frame.width > crop.width * 1.1 || frame.height > crop.height * 1.1)
          ? [`${photo.name}: při exportu se zvětší a může být méně ostrá.`]
          : [];
    }) ?? [];

  return (
    <div
      className="wm-app"
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (!busy) void importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <header className="wm-topbar">
        <a className="wm-brand" href="/">
          <span className="wm-brand-icon">
            <Grid2X2 size={21} />
          </span>
          <span>
            GridWiggle <em>Wallpapers</em>
          </span>
        </a>
        <span className="wm-private">
          <ShieldCheck size={15} /> Fotografie zůstávají u tebe
        </span>
        <Link className="wm-classic" to="/classic">
          Původní editor ↗
        </Link>
      </header>
      <div className="wm-workspace">
        <aside className="wm-sidebar">
          <section>
            <div className="wm-section-heading">
              <span>01</span>
              <h2>Fotografie</h2>
              <b>{photos.length}/100</b>
            </div>
            <input
              ref={input}
              aria-label="Přidat fotografie"
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files)
                  void importFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
            <button
              className="wm-upload"
              disabled={!!busy || !restored}
              onClick={() => input.current?.click()}
            >
              <ImagePlus size={22} />
              <span>
                Přidat fotografie<small>nebo je přetáhni kamkoliv sem</small>
              </span>
              <Plus size={18} />
            </button>
            <div className="wm-photo-tray">
              {photos.map((photo, i) => (
                <div key={photo.id} className="wm-photo-thumb">
                  <button
                    title={`Upravit ${photo.name}`}
                    onClick={() => {
                      if (settings.mode === "single") setSelected(i);
                      setEditing(photo.id);
                    }}
                  >
                    <img src={photo.previewUrl} alt={photo.name} />
                    <span
                      className={`wm-analysis-dot ${photo.analysis}`}
                      title={
                        photo.analysis === "ready"
                          ? "Motiv rozpoznán"
                          : photo.analysis === "manual"
                            ? "Ruční motiv"
                            : photo.analysis === "pending"
                              ? "Čeká na AI"
                              : "Odhad podle obrazu"
                      }
                    />
                  </button>
                  <button
                    className="wm-remove"
                    disabled={!!busy}
                    aria-label={`Odebrat ${photo.name}`}
                    onClick={() => {
                      for (const url of new Set([
                        photo.url,
                        photo.previewUrl,
                      ])) {
                        URL.revokeObjectURL(url);
                        releaseImage(url);
                        urls.current.delete(url);
                      }
                      setPhotos((current) =>
                        current.filter((p) => p.id !== photo.id),
                      );
                      setEditing(undefined);
                      setSelected(0);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <label className="wm-check">
              <input
                type="checkbox"
                checked={autoAI}
                onChange={(e) => setAutoAI(e.target.checked)}
              />{" "}
              Automaticky hledat hlavní motivy
            </label>
            <button
              className="wm-ai"
              disabled={aiBusy || !photos.length || !!busy}
              onClick={() => void runAI(photos)}
            >
              {aiBusy ? (
                <Loader2 className="wm-spin" size={15} />
              ) : (
                <Sparkles size={15} />
              )}{" "}
              {aiBusy ? "Hledám motivy…" : "Najít motivy pomocí AI"}
            </button>
            <p className="wm-hint">
              AI běží lokálně. Při prvním použití stáhne model. Zelená tečka =
              rozpoznaný motiv, žlutá = odhad, modrá = ruční výběr.
            </p>
          </section>
          <section>
            <div className="wm-section-heading">
              <span>02</span>
              <h2>Rozložení</h2>
            </div>
            <div className="wm-modes">
              {modes.map(({ id, label, detail, icon: Icon }) => (
                <button
                  key={id}
                  className={settings.mode === id ? "active" : ""}
                  aria-pressed={settings.mode === id}
                  onClick={() => {
                    update({ mode: id });
                    setSelected(0);
                    setEditing(undefined);
                  }}
                >
                  <Icon size={18} />
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </button>
              ))}
            </div>
            <label className="wm-slider-label">
              Mezery <strong>{settings.gap} px</strong>
              <input
                type="range"
                aria-label="Mezery"
                min="0"
                max="100"
                value={settings.gap}
                disabled={settings.mode !== "grid"}
                onChange={(e) => update({ gap: +e.target.value })}
              />
            </label>
            <label className="wm-slider-label">
              Vnější okraj <strong>{settings.margin} px</strong>
              <input
                type="range"
                aria-label="Vnější okraj"
                min="0"
                max="200"
                value={settings.margin}
                onChange={(e) => update({ margin: +e.target.value })}
              />
            </label>
            {settings.mode === "blend" && (
              <label className="wm-slider-label">
                Měkkost přechodů <strong>{settings.feather} %</strong>
                <input
                  type="range"
                  aria-label="Měkkost přechodů"
                  min="1"
                  max="40"
                  value={settings.feather}
                  onChange={(e) => update({ feather: +e.target.value })}
                />
              </label>
            )}
            <div className="wm-color-row">
              <span>Pozadí</span>
              <input
                aria-label="Barva pozadí"
                type="color"
                value={settings.background}
                onChange={(e) => update({ background: e.target.value })}
              />
              <code>{settings.background}</code>
            </div>
            <label className="wm-check">
              <input
                type="checkbox"
                checked={settings.keepSubjects}
                onChange={(e) => update({ keepSubjects: e.target.checked })}
              />{" "}
              Chránit celý hlavní motiv
            </label>
            <p className="wm-hint">
              Když se motiv nevejde do výřezu, ukáže se celá fotka s rozostřeným
              pozadím.
            </p>
          </section>
          <section>
            <div className="wm-section-heading">
              <span>03</span>
              <h2>Výstup</h2>
              <Monitor size={16} />
            </div>
            <label className="wm-field">
              Předvolba
              <select
                aria-label="Předvolba rozlišení"
                value={`${settings.width}x${settings.height}`}
                onChange={(e) => {
                  const [width, height] = e.target.value.split("x").map(Number);
                  update({ width, height });
                  setSizeMode("pixels");
                }}
              >
                <option value={`${settings.width}x${settings.height}`}>
                  Vlastní · {settings.width} × {settings.height}
                </option>
                {presets.map(([name, w, h]) => (
                  <option key={name} value={`${w}x${h}`}>
                    {name} · {w} × {h}
                  </option>
                ))}
              </select>
            </label>
            <div className="wm-segment">
              <button
                className={sizeMode === "pixels" ? "active" : ""}
                onClick={() => setSizeMode("pixels")}
              >
                Přesné rozlišení
              </button>
              <button
                className={sizeMode === "ratio" ? "active" : ""}
                onClick={() => {
                  setSizeMode("ratio");
                  setRatio({
                    w: settings.width,
                    h: settings.height,
                    edge: Math.max(settings.width, settings.height),
                  });
                }}
              >
                Poměr stran
              </button>
            </div>
            {sizeMode === "pixels" ? (
              <div className="wm-two-fields">
                <label className="wm-field">
                  Šířka
                  <input
                    aria-label="Šířka výstupu"
                    type="number"
                    min="64"
                    max="16384"
                    value={settings.width}
                    onChange={(e) =>
                      update({ width: Math.max(1, +e.target.value) })
                    }
                  />
                </label>
                <label className="wm-field">
                  Výška
                  <input
                    aria-label="Výška výstupu"
                    type="number"
                    min="64"
                    max="16384"
                    value={settings.height}
                    onChange={(e) =>
                      update({ height: Math.max(1, +e.target.value) })
                    }
                  />
                </label>
              </div>
            ) : (
              <>
                <div className="wm-two-fields">
                  <label className="wm-field">
                    Poměr · šířka
                    <input
                      aria-label="Poměr šířka"
                      type="number"
                      min="1"
                      value={ratio.w}
                      onChange={(e) =>
                        applyRatio({ ...ratio, w: +e.target.value })
                      }
                    />
                  </label>
                  <label className="wm-field">
                    Poměr · výška
                    <input
                      aria-label="Poměr výška"
                      type="number"
                      min="1"
                      value={ratio.h}
                      onChange={(e) =>
                        applyRatio({ ...ratio, h: +e.target.value })
                      }
                    />
                  </label>
                </div>
                <label className="wm-field">
                  Delší strana (px)
                  <input
                    aria-label="Delší strana"
                    type="number"
                    min="64"
                    max="16384"
                    value={ratio.edge}
                    onChange={(e) =>
                      applyRatio({ ...ratio, edge: +e.target.value })
                    }
                  />
                </label>
              </>
            )}
            <button
              className="wm-text-button"
              onClick={() => {
                update({ width: settings.height, height: settings.width });
                setRatio((r) => ({ ...r, w: r.h, h: r.w }));
              }}
            >
              ↔ Prohodit orientaci
            </button>
            <div className="wm-two-fields">
              <label className="wm-field">
                Formát
                <select
                  aria-label="Formát exportu"
                  value={settings.format}
                  onChange={(e) =>
                    update({
                      format: e.target.value as WallpaperSettings["format"],
                    })
                  }
                >
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                  <option value="webp">WebP</option>
                </select>
              </label>
              <label className="wm-field">
                Kvalita
                <select
                  aria-label="Kvalita exportu"
                  disabled={settings.format === "png"}
                  value={settings.quality}
                  onChange={(e) => update({ quality: +e.target.value })}
                >
                  <option value="1">100 %</option>
                  <option value="0.94">94 %</option>
                  <option value="0.85">85 %</option>
                  <option value="0.7">70 %</option>
                </select>
              </label>
            </div>
            <p className="wm-size-readout">
              {settings.width.toLocaleString("cs")} ×{" "}
              {settings.height.toLocaleString("cs")} px{" "}
              <span>
                {((settings.width * settings.height) / 1e6).toFixed(1)} MP
              </span>
            </p>
            {validSize && (
              <p className="wm-warning" role="alert">
                {validSize}
              </p>
            )}
          </section>
          {photos.length > 0 && (
            <button
              className="wm-clear"
              disabled={!!busy}
              onClick={() => {
                aiGeneration.current++;
                cancelAnalysis();
                for (const url of urls.current) {
                  URL.revokeObjectURL(url);
                  releaseImage(url);
                }
                urls.current.clear();
                setPhotos([]);
                setAdjustments({});
                setReadyDownload(undefined);
                setSelected(0);
                setEditing(undefined);
                setNotice(
                  "Projekt vyprázdněn. Původní soubory zůstávají zachované.",
                );
              }}
            >
              <Trash2 size={14} /> Vyprázdnit projekt
            </button>
          )}
        </aside>
        <main className="wm-main">
          <div className="wm-heading">
            <div>
              <span className="wm-eyebrow">TVÉ FOTKY. TVOJE PLOCHA.</span>
              <h1>Dej vzpomínkám prostor.</h1>
              <p>
                Vyber kompozici. Dolaď výřezy. Stáhni tapetu přesně pro svůj
                displej.
              </p>
            </div>
            <span className="wm-local-badge">
              <span /> LOKÁLNÍ STUDIO
            </span>
          </div>
          {(error || notice || aiStatus || readyDownload) && (
            <div className="wm-messages" aria-live="polite">
              {error && (
                <p className="wm-warning" role="alert">
                  {error}
                </p>
              )}
              {notice && <p>{notice}</p>}
              {readyDownload && (
                <p>
                  Poslední export:{" "}
                  <a
                    className="wm-download-link"
                    href={readyDownload.url}
                    download={readyDownload.name}
                  >
                    Stáhnout soubor · {readyDownload.name}
                  </a>
                </p>
              )}
              {aiStatus && (
                <p className="wm-ai-progress">
                  <Loader2 className="wm-spin" size={14} /> {aiStatus}
                </p>
              )}
            </div>
          )}
          {!photos.length ? (
            <div className="wm-empty">
              <div className="wm-empty-cards">
                <div />
                <div />
                <div />
              </div>
              <span className="wm-eyebrow">ZAČNI SVÝMI FOTOGRAFIEMI</span>
              <h2>Malá sbírka. Velký výhled.</h2>
              <p>
                Na výšku i na šířku. Přidej fotografie a studio z nich navrhne
                šest kompozic pro tvůj monitor.
              </p>
              <button
                className="wm-primary"
                disabled={!!busy || !restored}
                onClick={() => input.current?.click()}
              >
                <Plus size={17} /> Vybrat fotografie
              </button>
              <small>
                JPEG, PNG, WebP a další formáty podporované prohlížečem
              </small>
            </div>
          ) : (
            layout && (
              <>
                <div className="wm-preview-toolbar">
                  <span>
                    <strong>{layout.name}</strong>
                    <small>
                      {modes.find((m) => m.id === settings.mode)?.label} ·{" "}
                      {photos.length} fotografií
                    </small>
                  </span>
                  <button
                    className="wm-secondary"
                    disabled={!!busy || settings.mode === "single"}
                    onClick={() => {
                      setSeed((n) => n + 1);
                      setSelected(0);
                      setAdjustments({});
                    }}
                  >
                    <RefreshCw size={15} /> Další návrhy
                  </button>
                </div>
                <div className="wm-preview-stage">
                  <div
                    className="wm-preview-inner"
                    style={{
                      maxWidth:
                        settings.width < settings.height ? 560 : undefined,
                    }}
                  >
                    <WallpaperCanvas
                      photos={photos}
                      layout={layout}
                      settings={settings}
                      adjustments={adjustments}
                      onSelect={setEditing}
                    />
                  </div>
                </div>
                <div className="wm-preview-caption">
                  <span>
                    <Crosshair size={14} /> Klikni na fotografii a uprav její
                    výřez.
                  </span>
                  <span>
                    {settings.width} × {settings.height} px
                  </span>
                </div>
                {warnings.length > 0 && (
                  <details className="wm-warnings">
                    <summary>
                      {warnings.length} upozornění k výřezům nebo rozlišení{" "}
                      <ChevronDown size={14} />
                    </summary>
                    {warnings.map((warning, i) => (
                      <p key={i}>{warning}</p>
                    ))}
                  </details>
                )}
                <div className="wm-proposals-heading">
                  <h2>
                    {settings.mode === "single"
                      ? "Samostatné tapety"
                      : "Najdi svůj oblíbený návrh"}
                  </h2>
                  <span>
                    {layouts.length}{" "}
                    {settings.mode === "single" ? "tapet" : "kompozic"}
                  </span>
                </div>
                <div className="wm-proposals">
                  {layouts.map((proposal, i) => (
                    <button
                      key={proposal.id}
                      className={`wm-proposal ${selected === i ? "active" : ""}`}
                      aria-label={`Vybrat ${proposal.name}`}
                      aria-pressed={selected === i}
                      onClick={() => setSelected(i)}
                    >
                      <WallpaperCanvas
                        photos={photos}
                        layout={proposal}
                        settings={settings}
                        adjustments={adjustments}
                        thumbnail
                      />
                      <span>
                        {proposal.name}
                        {selected === i && <Check size={14} />}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )
          )}
          <footer className="wm-bottom">
            <span>
              <ShieldCheck size={14} />{" "}
              {storageStatus || "Bez nahrávání fotografií na server"}
            </span>
            <span>GridWiggle · Wallpaper Studio</span>
          </footer>
        </main>
      </div>
      {photos.length > 0 && (
        <div className="wm-export-bar">
          <span>
            <strong>{busy || "Připraveno pro tvůj displej"}</strong>
            <small>
              {settings.width} × {settings.height} px ·{" "}
              {settings.format.toUpperCase()}
              {aiBusy ? " · AI ještě analyzuje fotografie" : ""}
            </small>
          </span>
          <div>
            <button
              className="wm-secondary"
              disabled={!!busy || !!validSize}
              onClick={() => void handleExport(true)}
            >
              <ArrowDownToLine size={16} />{" "}
              {settings.mode === "single" ? "Všechny tapety" : "Všech 6 návrhů"}{" "}
              · ZIP
            </button>
            <button
              className="wm-primary"
              disabled={!!busy || !!validSize}
              onClick={() => void handleExport(false)}
            >
              {busy ? (
                <Loader2 className="wm-spin" size={17} />
              ) : (
                <Download size={17} />
              )}{" "}
              Stáhnout tapetu
            </button>
          </div>
        </div>
      )}
      {editedPhoto &&
        layout?.cells.some((c) => c.photoId === editedPhoto.id) && (
          <FramingEditor
            key={`${layout.id}-${editedPhoto.id}`}
            photo={editedPhoto}
            layout={layout}
            settings={settings}
            adjustments={adjustments}
            onClose={() => setEditing(undefined)}
            onSave={(photo, adjustment) => {
              setPhotos((current) =>
                current.map((p) => (p.id === photo.id ? photo : p)),
              );
              setAdjustments((current) => {
                const next = { ...current };
                const key = adjustmentKey(layout, photo.id);
                if (adjustment) next[key] = adjustment;
                else delete next[key];
                return next;
              });
              setEditing(undefined);
            }}
          />
        )}
    </div>
  );
}
