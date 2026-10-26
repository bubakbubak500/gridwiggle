import type { Adjustments, WallpaperPhoto, WallpaperSettings } from "./types";
export interface WallpaperProject {
  photos: Omit<WallpaperPhoto, "url" | "previewUrl">[];
  settings: WallpaperSettings;
  adjustments: Adjustments;
  seed: number;
}
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("gridwiggle-wallpaper", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("project");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function loadProject(): Promise<WallpaperProject | undefined> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction("project", "readonly");
    const request = tx.objectStore("project").get("current");
    tx.oncomplete = () => {
      database.close();
      resolve(request.result);
    };
    tx.onerror = () => {
      database.close();
      reject(tx.error);
    };
  });
}
export async function saveProject(project: WallpaperProject) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction("project", "readwrite");
    tx.objectStore("project").put(project, "current");
    tx.oncomplete = () => {
      database.close();
      resolve();
    };
    tx.onerror = () => {
      database.close();
      reject(tx.error);
    };
  });
}
