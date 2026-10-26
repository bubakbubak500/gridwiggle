export type WallpaperMode = "grid" | "overlap" | "blend" | "single" | "extend";
export interface PhotoPlacement {
  x: number;
  y: number;
  scale: number;
}
export interface ExtensionSettings {
  fill: "texture" | "blur" | "color" | "solid";
  softness: number;
  blur: number;
  effect: "none" | "grain" | "vignette" | "both";
}
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Subject extends Box {
  label: string;
  score: number;
}
export interface WallpaperPhoto {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  subjects: Subject[];
  focus: { x: number; y: number };
  protectedBox?: Box;
  analysis: "pending" | "ready" | "manual" | "fallback";
}
export interface WallpaperSettings {
  width: number;
  height: number;
  mode: WallpaperMode;
  gap: number;
  margin: number;
  feather: number;
  background: string;
  keepSubjects: boolean;
  format: "png" | "jpeg" | "webp";
  quality: number;
  extension: ExtensionSettings;
}
export interface WallpaperCell extends Box {
  id: string;
  photoId: string;
  rotation: number;
}
export interface WallpaperLayout {
  id: string;
  name: string;
  cells: WallpaperCell[];
}
export interface CropAdjustment {
  x: number;
  y: number;
  zoom: number;
  fit: "auto" | "cover" | "contain";
  placement?: PhotoPlacement;
}
export type Adjustments = Record<string, CropAdjustment>;
export const defaultWallpaperSettings: WallpaperSettings = {
  width: 3840,
  height: 2160,
  mode: "grid",
  gap: 12,
  margin: 20,
  feather: 18,
  background: "#101318",
  keepSubjects: true,
  format: "png",
  quality: 0.94,
  extension: { fill: "texture", softness: 16, blur: 35, effect: "none" },
};
export const defaultPlacement: PhotoPlacement = { x: 0.5, y: 0.5, scale: 0.88 };
