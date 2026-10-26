# GridWiggle · Wallpaper Studio

Local wallpaper maker forked from [kclemson/gridwiggle](https://github.com/kclemson/gridwiggle).
The original collage editor remains available at `/classic`. The new Czech wallpaper workspace is at `/`.

## What is included

- Import up to 100 mixed portrait and landscape photos by file picker or drag and drop.
- Five modes: separated tiles, overlapping framed photos, symmetric soft image blends, one wallpaper per photo, and a single photo placed freely over extended surroundings.
- **Extend surroundings:** shrink a whole portrait or landscape photo to 15–100%, drag it across the canvas, or align it left/center/right. Surround it with reflected/stretched edge texture, a blurred photo backdrop, an automatic edge color, or a custom solid color. Control the feathering, background blur, film grain and vignette. Each photo retains its own placement.
- **Symmetric blending:** both photos fade across every internal boundary; their contributions are normalized together. This avoids a dark seam and makes the result independent of which photo was drawn first. Subject protection changes blend weights gradually instead of turning the overlap into a hard boundary.
- Six seeded collage proposals at once, with a shuffle button for more compositions.
- Exact pixel output or a custom width:height ratio plus a long-edge resolution. Presets include Full HD, QHD, 4K, ultrawide and portrait.
- Local object detection using GridWiggle's DETR worker, extended to expose all supported object classes. People and animals take priority over furniture; groups of prominent subjects of the same class are retained together.
- Manual selection of a detected object or a click on the original to choose a focus point. Every proposal has independent drag/arrow-key framing and 1–4× zoom.
- Automatic whole-photo placement over a blurred background when the protected subject cannot fit in the target cell. Manual cover and contain overrides are available.
- PNG, JPEG and WebP export from original images. Export all proposals or all standalone wallpapers as one ZIP.
- Every image and ZIP name includes local date and time down to seconds after its resolution, e.g. `tapeta-01-3840x2160-2026-10-26-14-32-07.png`. Multiple exports in the same second receive a numeric suffix; a ZIP and its members share one export timestamp.
- Browser-local project autosave, including original photos, settings and framing.
- A shared Canvas renderer for preview and export. Remote telemetry is disabled by default in this fork.

## Run the ready-made Windows package

Extract the release ZIP and double-click **Start-Wallpaper.cmd**. It starts a server bound to `127.0.0.1` and opens the studio at `http://127.0.0.1:8080`.
Keep the server window open while using the app; Ctrl+C stops it. The launcher uses an installed Node.js or the Codex bundled Node.js runtime when available. Otherwise install Node.js 22 or newer.

The release contains a built `dist/`; dependency installation is unnecessary for using that package.

## Develop from source

Requires Node.js 22+ and pnpm 11.25.0. `pnpm-lock.yaml` is the canonical lockfile.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:8080`. To build and run the production version:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

For a server without automatically opening a browser, run `node scripts/serve.mjs`.
Set `GRIDWIGGLE_PORT` to use a different port.

## Using the studio

1. Add photos. The composition is immediately usable while the optional AI model downloads and runs.
2. Choose a mode and output dimensions. A ratio such as 21:9 with a 3440 px long edge produces 3440 × 1474 pixels after integer rounding. Use exact-pixel mode for 3440 × 1440.
3. Pick a proposal. Click a photo to change its framing. Drag or use arrow keys over the crop preview; use the zoom slider, object outlines, or focus-point selection on the original.
4. Keep subject protection enabled for automatic safe framing. A manual cover crop can cut the selected subject; the editor and main preview report that condition.
5. Download the current wallpaper or export the complete set as ZIP. Output dimensions refer to pixels, without stretching source photos.

For a portrait with open space around it, choose **Rozšířit okolí**. Use **Velikost fotografie** to reduce it, **Vlevo / Na střed / Vpravo** or the horizontal/vertical sliders to position it, and **Doplnění okolí** to choose the backdrop. Dragging the photo directly on the canvas works too; arrow keys move a focused photo. Texture mode reflects and stretches strips from the existing photo edges rather than generating new scene content.

Green photo indicators mean a detected object, yellow means a contrast/edge estimate, blue means manual selection, and gray means pending analysis.

## Privacy and practical limits

Photos are processed on the device and stored only in this browser's IndexedDB. This fork does not upload photos or send remote logs by default. AI downloads model/runtime files from Hugging Face and the runtime's configured distribution host; those downloads require internet access on first use. Inference runs locally.

DETR recognizes a fixed vocabulary of common objects, not every possible photographic subject. If no supported object is detected or inference fails, the studio marks the result as an estimate and lets you select a focus point yourself. Verify unusual scenes and illustrations manually.

Each output side supports 64–16,384 pixels, with a 48-megapixel total limit. Individual imports are limited to 60 MB and must be decodable by the browser. Large originals and batch exports require sufficient browser memory. Subject protection may reduce overlap and blending near important details. Export does not invent additional image detail; low-resolution inputs can look soft when enlarged.

Saved projects are tied to this browser and origin (including port). Clearing browser storage deletes the local draft. The standalone export is an image, not an editable project backup.

`VITE_ENABLE_REMOTE_LOGGING=true` explicitly re-enables the upstream logger, so do not set it for a local-only installation.

## Verification

The test suite includes the original layout/crop tests plus fixed-ratio packing, mixed-orientation inputs, group/foreground protection, manual crop bounds, native Canvas rendering in all four modes, PNG/JPEG/WebP pixel dimensions, and ZIP structure checks.

## Upstream and attribution

Based on GridWiggle by [kclemson](https://github.com/kclemson), whose README declares the MIT license.
The preserved [upstream README](README.upstream.md) describes the original application and its development tools; the capabilities and privacy behavior above describe this fork.
