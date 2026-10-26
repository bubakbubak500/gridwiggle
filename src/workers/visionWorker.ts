import { pipeline, RawImage, env } from "@huggingface/transformers";

// Detect Safari (both iOS and macOS) - all Safari versions share the JavaScriptCore bug
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

if (isSafari) {
  env.backends.onnx.wasm.numThreads = 1;
}

// Diagnostic: confirm Safari detection and WASM config inside the worker
self.postMessage({ type: 'status', message: `[diag] UA: ${navigator.userAgent}` });
self.postMessage({ type: 'status', message: `[diag] isSafari: ${isSafari}` });
self.postMessage({ type: 'status', message: `[diag] numThreads: ${env.backends.onnx.wasm.numThreads}` });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let detector: any = null;
let loadedForMobile: boolean | null = null; // track which model variant is cached

const PET_LABELS = new Set(['cat', 'dog']);

/**
 * Detections smaller than this fraction of the processed image area are
 * treated as background noise (e.g. a pedestrian on a distant boardwalk)
 * and excluded from the smart-crop bbox union. Tune up for stricter
 * "main subject only", down for more inclusive crops.
 */
const MIN_SUBJECT_AREA_FRACTION = 0.02;

interface DetectionResult {
  label: string;
  score: number;
  box: { xmin: number; ymin: number; xmax: number; ymax: number };
}

interface WorkerMessage {
  type: 'detect';
  imageBlob: Blob;
  originalWidth: number;
  originalHeight: number;
  isMobile: boolean;
}

async function loadModel(isMobile: boolean) {
  // Reload if switching between mobile/desktop model variants
  if (detector && loadedForMobile !== isMobile) {
    detector = null;
  }
  
  if (!detector) {
    const modelName = isMobile ? "Xenova/yolos-tiny" : "Xenova/detr-resnet-50";
    self.postMessage({ type: 'status', message: `Loading AI model (${modelName})...` });
    
    // Safari must use WASM (non-JSEP binaries don't support WebGPU)
    const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
    const device = isSafari ? "wasm" : (hasWebGPU ? "webgpu" : "wasm");
    
    self.postMessage({ type: 'status', message: `[diag] loading model=${modelName} device=${device} hasWebGPU=${hasWebGPU}` });
    try {
      detector = await pipeline("object-detection", modelName, { device, dtype: 'q8' });
    } catch (error) {
      if (device === 'wasm') throw error;
      self.postMessage({ type: 'status', message: 'WebGPU není dostupné, přepínám na CPU…' });
      detector = await pipeline("object-detection", modelName, { device: 'wasm', dtype: 'q8' });
    }
    loadedForMobile = isMobile;
  }
  return detector;
}

function calculateOptimalCrop(
  detections: DetectionResult[],
  originalWidth: number,
  originalHeight: number,
  processedWidth: number,
  processedHeight: number
): { x: number; y: number; width: number; height: number } {
  // Filter by confidence > 0.4, prioritize people if detected
  const allSubjects = detections.filter(d => d.score > 0.4);
  const people = allSubjects.filter(d => d.label === 'person');
  const pets = allSubjects.filter(d => PET_LABELS.has(d.label));
  const candidates = people.length > 0 ? people
                   : pets.length > 0 ? pets
                   : allSubjects;

  // Drop tiny detections (background figures, false positives on small objects)
  // so they don't drag the union bbox off-center toward the edges.
  const imageArea = processedWidth * processedHeight;
  const minBoxArea = imageArea * MIN_SUBJECT_AREA_FRACTION;
  const subjects = candidates.filter(d => {
    const w = d.box.xmax - d.box.xmin;
    const h = d.box.ymax - d.box.ymin;
    return w * h >= minBoxArea;
  });

  self.postMessage({
    type: 'status',
    message: `Subjects: ${candidates.length} candidate, ${subjects.length} kept after area filter (>= ${(MIN_SUBJECT_AREA_FRACTION * 100).toFixed(1)}%)`,
  });

  if (subjects.length === 0) {
    // No subjects detected - use full image (no cropping)
    return {
      x: 0,
      y: 0,
      width: originalWidth,
      height: originalHeight
    };
  }
  
  // Scale factor to convert from processed dimensions back to original
  const scaleX = originalWidth / processedWidth;
  const scaleY = originalHeight / processedHeight;
  
  // Find bounding box that contains ALL detected subjects
  let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
  
  for (const subject of subjects) {
    // Scale coordinates back to original image dimensions
    minX = Math.min(minX, subject.box.xmin * scaleX);
    minY = Math.min(minY, subject.box.ymin * scaleY);
    maxX = Math.max(maxX, subject.box.xmax * scaleX);
    maxY = Math.max(maxY, subject.box.ymax * scaleY);
  }
  
  // Add 10% padding based on smaller dimension (consistent padding)
  const padding = Math.min(originalWidth, originalHeight) * 0.1;
  
  // Apply padding and clamp to image bounds
  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  const right = Math.min(originalWidth, maxX + padding);
  const bottom = Math.min(originalHeight, maxY + padding);
  
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(right - x),
    height: Math.round(bottom - y)
  };
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type !== 'detect') return;
  
  try {
    self.postMessage({ type: 'status', message: 'Loading AI model...' });
    const model = await loadModel(e.data.isMobile);
    self.postMessage({ type: 'status', message: 'Model ready. Loading image...' });
    
    // Load image directly from blob - no base64 conversion needed
    const blobSize = e.data.imageBlob?.size ?? -1;
    self.postMessage({ type: 'status', message: `Loading image (blob: ${blobSize} bytes)...` });
    let image = await RawImage.fromBlob(e.data.imageBlob);
    self.postMessage({ type: 'status', message: `Image loaded: ${image.width}x${image.height}` });
    
    const maxSize = e.data.isMobile ? 320 : 640;
    const origW = image.width;
    const origH = image.height;
    let processedWidth = origW;
    let processedHeight = origH;
    
    if (origW > maxSize || origH > maxSize) {
      const scale = Math.min(maxSize / origW, maxSize / origH);
      processedWidth = Math.round(origW * scale);
      processedHeight = Math.round(origH * scale);
      self.postMessage({ type: 'status', message: `Resizing to ${processedWidth}x${processedHeight} (max ${maxSize})...` });
      image = await image.resize(processedWidth, processedHeight);
      self.postMessage({ type: 'status', message: 'Resize complete' });
    }
    
    self.postMessage({ type: 'status', message: 'Running inference...' });
    const results = await model(image) as DetectionResult[];
    // Release pixel buffer immediately to reduce peak memory
    image = null as any;
    self.postMessage({ type: 'status', message: `Inference done: ${results.length} detections` });
    
    // Calculate optimal crop
    const crop = calculateOptimalCrop(
      results,
      e.data.originalWidth,
      e.data.originalHeight,
      processedWidth,
      processedHeight
    );
    
    // Determine subject description
    const subjects = results
      .filter(r => r.score > 0.4)
      .map(r => r.label);
    const subjectDescription = subjects.length > 0 
      ? [...new Set(subjects)].join(', ')
      : 'No subjects detected';
    
    // Calculate max confidence from filtered results
    const maxConfidence = subjects.length > 0 
      ? Math.max(...results.filter(r => r.score > 0.4).map(r => r.score)) 
      : 0;
    
    // Only apply smart crop if a person was detected
    // DETR hallucinates random objects (banana, vase) for cartoons
    // but reliably detects "person" in real photos
    // Apply the same area filter here so a tiny background figure doesn't
    // count as "we have a subject" — keeps skipCrop in sync with the bbox.
    const minBoxAreaForSubject = (processedWidth * processedHeight) * MIN_SUBJECT_AREA_FRACTION;
    const hasSubject = results.some(r => {
      if (r.score <= 0.4) return false;
      if (r.label !== 'person' && !PET_LABELS.has(r.label)) return false;
      const w = r.box.xmax - r.box.xmin;
      const h = r.box.ymax - r.box.ymin;
      return w * h >= minBoxAreaForSubject;
    });
    const skipCrop = !hasSubject;
    
    self.postMessage({
      type: 'result',
      crop,
      confidence: maxConfidence,
      subjects: subjectDescription,
      skipCrop,
      detections: results.filter(r => r.score >= 0.5).map(r => ({
        label: r.label, score: r.score,
        x: Math.max(0, r.box.xmin / processedWidth),
        y: Math.max(0, r.box.ymin / processedHeight),
        width: Math.min(processedWidth, r.box.xmax) / processedWidth - Math.max(0, r.box.xmin / processedWidth),
        height: Math.min(processedHeight, r.box.ymax) / processedHeight - Math.max(0, r.box.ymin / processedHeight),
      })).filter(r => r.width * r.height >= 0.005),
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Detection failed'
    });
  }
};
