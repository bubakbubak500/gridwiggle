let previousStamp = "";
let sameSecond = 0;

/** One local timestamp per export, shared by the ZIP and its members. Avoid same-second collisions too. */
export function exportTimestamp(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  sameSecond = stamp === previousStamp ? sameSecond + 1 : 0;
  previousStamp = stamp;
  return sameSecond
    ? `${stamp}-${String(sameSecond + 1).padStart(2, "0")}`
    : stamp;
}
export function wallpaperFilename(
  index: number,
  width: number,
  height: number,
  extension: string,
  timestamp: string,
) {
  return `tapeta-${String(index + 1).padStart(2, "0")}-${width}x${height}-${timestamp}.${extension}`;
}
export function archiveFilename(
  width: number,
  height: number,
  timestamp: string,
) {
  return `gridwiggle-${width}x${height}-${timestamp}.zip`;
}
