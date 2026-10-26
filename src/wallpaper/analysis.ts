import { clamp } from "./geometry";
import type { Box, Subject, WallpaperPhoto } from "./types";

type DetectionMessage = {
  type: string;
  message?: string;
  detections?: Subject[];
  error?: string;
};
let worker: Worker | undefined;
let queue = Promise.resolve();
let cancelCurrent: (() => void) | undefined;
function detect(
  photo: WallpaperPhoto,
  onStatus: (status: string) => void,
): Promise<Subject[]> {
  return new Promise((resolve, reject) => {
    worker ??= new Worker(
      new URL("../workers/visionWorker.ts", import.meta.url),
      { type: "module" },
    );
    const current = worker;
    const timer = window.setTimeout(() => {
      current.terminate();
      worker = undefined;
      cleanup();
      reject(
        new Error(
          "Stažení modelu nebo analýza trvá příliš dlouho. Zkus AI znovu.",
        ),
      );
    }, 180_000);
    const cleanup = () => {
      clearTimeout(timer);
      current.removeEventListener("message", listener);
      current.removeEventListener("error", error);
      cancelCurrent = undefined;
    };
    const listener = (event: MessageEvent<DetectionMessage>) => {
      if (event.data.type === "status")
        onStatus(event.data.message ?? "Analyzuji fotografii…");
      if (event.data.type === "result") {
        cleanup();
        resolve(event.data.detections ?? []);
      }
      if (event.data.type === "error") {
        cleanup();
        reject(new Error(event.data.error));
      }
    };
    const error = () => {
      cleanup();
      current.terminate();
      worker = undefined;
      reject(new Error("AI není dostupná v tomto prohlížeči."));
    };
    cancelCurrent = () => {
      cleanup();
      current.terminate();
      worker = undefined;
      reject(new Error("Analýza zrušena."));
    };
    current.addEventListener("message", listener);
    current.addEventListener("error", error);
    current.postMessage({
      type: "detect",
      imageBlob: photo.blob,
      originalWidth: photo.width,
      originalHeight: photo.height,
      isMobile: false,
    });
  });
}
export function analyzePhoto(
  photo: WallpaperPhoto,
  onStatus: (status: string) => void,
) {
  const task = queue.then(() => detect(photo, onStatus));
  queue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
export function cancelAnalysis() {
  cancelCurrent?.();
  worker?.terminate();
  worker = undefined;
}
export function subjectFraming(subjects: Subject[]) {
  if (!subjects.length) return undefined;
  const foreground = new Set([
    "person",
    "cat",
    "dog",
    "bird",
    "horse",
    "sheep",
    "cow",
    "elephant",
    "bear",
    "zebra",
    "giraffe",
  ]);
  const background = new Set([
    "couch",
    "bed",
    "dining table",
    "chair",
    "bench",
  ]);
  const score = (s: Subject) =>
    Math.sqrt(s.width * s.height) *
    s.score *
    (foreground.has(s.label) ? 3 : background.has(s.label) ? 0.3 : 1);
  const ranked = [...subjects].sort((a, b) => score(b) - score(a));
  const main = ranked[0];
  const group = ranked.filter(
    (s) =>
      s.label === main.label &&
      s.width * s.height > main.width * main.height * 0.15,
  );
  const x = Math.min(...group.map((s) => s.x)),
    y = Math.min(...group.map((s) => s.y));
  const right = Math.max(...group.map((s) => s.x + s.width)),
    bottom = Math.max(...group.map((s) => s.y + s.height));
  const pad = 0.025;
  const box: Box = {
    x: clamp(x - pad),
    y: clamp(y - pad),
    width: Math.min(1, right + pad) - clamp(x - pad),
    height: Math.min(1, bottom + pad) - clamp(y - pad),
  };
  return {
    protectedBox: box,
    focus: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  };
}

/** Contrast/edge fallback is explicitly labelled as an estimate, never as recognized subject AI. */
export function estimateFocus(img: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, 64, 64);
  const { data } = ctx.getImageData(0, 0, 64, 64);
  let best = -1,
    point = { x: 0.5, y: 0.5 };
  for (let y = 8; y < 56; y += 4)
    for (let x = 8; x < 56; x += 4) {
      let score = 0;
      for (let yy = y - 7; yy <= y + 7; yy++)
        for (let xx = x - 7; xx <= x + 7; xx++) {
          const i = (yy * 64 + xx) * 4,
            j = i + 4;
          score +=
            Math.abs(data[i] - data[j]) +
            Math.abs(data[i + 1] - data[j + 1]) +
            Math.abs(data[i + 2] - data[j + 2]);
        }
      score *= 1 - 0.3 * Math.hypot(x / 64 - 0.5, y / 64 - 0.5);
      if (score > best) {
        best = score;
        point = { x: x / 64, y: y / 64 };
      }
    }
  return point;
}
