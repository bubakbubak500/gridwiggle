import { describe, expect, it } from "vitest";
import {
  archiveFilename,
  exportTimestamp,
  wallpaperFilename,
} from "./filenames";

describe("timestamped exports", () => {
  it("puts local date and full time including seconds immediately after the resolution", () => {
    const stamp = exportTimestamp(new Date(2026, 9, 26, 14, 7, 9));
    expect(stamp).toBe("2026-10-26-14-07-09");
    expect(wallpaperFilename(2, 3840, 2160, "png", stamp)).toBe(
      "tapeta-03-3840x2160-2026-10-26-14-07-09.png",
    );
    expect(archiveFilename(3840, 2160, stamp)).toBe(
      "gridwiggle-3840x2160-2026-10-26-14-07-09.zip",
    );
    expect(wallpaperFilename(0, 100, 200, "jpg", stamp)).not.toMatch(
      /[<>:"/\\|?*]/,
    );
  });
  it("also separates exports made in the very same second", () => {
    const time = new Date(2026, 9, 26, 16, 22, 11);
    const names = [
      exportTimestamp(time),
      exportTimestamp(time),
      exportTimestamp(time),
    ];
    expect(new Set(names).size).toBe(3);
    expect(names[1]).toBe("2026-10-26-16-22-11-02");
    expect(exportTimestamp(new Date(2026, 9, 26, 16, 23, 11))).toBe(
      "2026-10-26-16-23-11",
    );
  });
});
