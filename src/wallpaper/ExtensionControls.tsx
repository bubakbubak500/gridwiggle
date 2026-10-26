import { AlignCenter, AlignLeft, AlignRight, RotateCcw } from "lucide-react";
import {
  defaultPlacement,
  type ExtensionSettings,
  type PhotoPlacement,
} from "./types";

export function ExtensionControls({
  style,
  placement,
  background,
  onStyle,
  onPlacement,
  onBackground,
}: {
  style: ExtensionSettings;
  placement: PhotoPlacement;
  background: string;
  onStyle: (patch: Partial<ExtensionSettings>) => void;
  onPlacement: (placement: PhotoPlacement) => void;
  onBackground: (color: string) => void;
}) {
  return (
    <div className="wm-extension-controls">
      <label className="wm-field">
        Doplnění okolí
        <select
          aria-label="Doplnění okolí"
          value={style.fill}
          onChange={(e) =>
            onStyle({ fill: e.target.value as ExtensionSettings["fill"] })
          }
        >
          <option value="texture">Textura z okrajů fotografie</option>
          <option value="blur">Rozostřené pozadí z fotografie</option>
          <option value="color">Barva převzatá z fotografie</option>
          <option value="solid">Vlastní jednolitá barva</option>
        </select>
      </label>
      {style.fill === "solid" && (
        <label className="wm-color-row">
          Barva okolí
          <input
            aria-label="Barva okolí"
            type="color"
            value={background}
            onChange={(e) => onBackground(e.target.value)}
          />
          <code>{background}</code>
        </label>
      )}
      <label className="wm-slider-label">
        Velikost fotografie
        <strong>{Math.round(placement.scale * 100)} %</strong>
        <input
          aria-label="Velikost fotografie"
          type="range"
          min="15"
          max="100"
          step="1"
          value={Math.round(placement.scale * 100)}
          onChange={(e) =>
            onPlacement({ ...placement, scale: +e.target.value / 100 })
          }
        />
      </label>
      <div className="wm-placement-presets">
        {[
          { x: 0, label: "Vlevo", Icon: AlignLeft },
          { x: 0.5, label: "Na střed", Icon: AlignCenter },
          { x: 1, label: "Vpravo", Icon: AlignRight },
        ].map(({ x, label, Icon }) => (
          <button
            key={x}
            className={Math.abs(placement.x - x) < 0.01 ? "active" : ""}
            onClick={() => onPlacement({ ...placement, x })}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>
      <label className="wm-slider-label">
        Vodorovná poloha<strong>{Math.round(placement.x * 100)} %</strong>
        <input
          aria-label="Vodorovná poloha fotografie"
          type="range"
          min="0"
          max="100"
          value={Math.round(placement.x * 100)}
          onChange={(e) =>
            onPlacement({ ...placement, x: +e.target.value / 100 })
          }
        />
      </label>
      <label className="wm-slider-label">
        Svislá poloha<strong>{Math.round(placement.y * 100)} %</strong>
        <input
          aria-label="Svislá poloha fotografie"
          type="range"
          min="0"
          max="100"
          value={Math.round(placement.y * 100)}
          onChange={(e) =>
            onPlacement({ ...placement, y: +e.target.value / 100 })
          }
        />
      </label>
      <label className="wm-slider-label">
        Prolnutí fotografie s okolím<strong>{style.softness} %</strong>
        <input
          aria-label="Prolnutí fotografie s okolím"
          type="range"
          min="0"
          max="40"
          value={style.softness}
          onChange={(e) => onStyle({ softness: +e.target.value })}
        />
      </label>
      {(style.fill === "texture" || style.fill === "blur") && (
        <label className="wm-slider-label">
          Zjemnění pozadí<strong>{style.blur} %</strong>
          <input
            aria-label="Zjemnění pozadí"
            type="range"
            min="0"
            max="100"
            value={style.blur}
            onChange={(e) => onStyle({ blur: +e.target.value })}
          />
        </label>
      )}
      <label className="wm-field">
        Efekt
        <select
          aria-label="Efekt okolí"
          value={style.effect}
          onChange={(e) =>
            onStyle({ effect: e.target.value as ExtensionSettings["effect"] })
          }
        >
          <option value="none">Čistá fotografie</option>
          <option value="grain">Jemné filmové zrno</option>
          <option value="vignette">Vinětace</option>
          <option value="both">Filmové zrno + vinětace</option>
        </select>
      </label>
      <button
        className="wm-text-button wm-reset-placement"
        onClick={() => onPlacement({ ...defaultPlacement })}
      >
        <RotateCcw size={12} /> Obnovit velikost a polohu
      </button>
      <p className="wm-hint">
        Fotografii můžeš také posouvat tažením přímo v náhledu. Okolí doplňuje
        barva nebo struktura z jejího původního pozadí.
      </p>
    </div>
  );
}
