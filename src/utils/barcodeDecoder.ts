import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  GlobalHistogramBinarizer,
  HTMLCanvasElementLuminanceSource,
  HybridBinarizer,
  LuminanceSource,
  MultiFormatReader,
} from '@zxing/library';

interface NativeDetectedBarcode {
  rawValue?: string;
}

interface NativeBarcodeDetector {
  detect: (source: ImageBitmapSource) => Promise<NativeDetectedBarcode[]>;
}

interface NativeBarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
}

const NATIVE_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'itf',
  'qr_code',
  'data_matrix',
];

const ZXING_HINTS = new Map<DecodeHintType, unknown>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.ITF,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
    ],
  ],
  [DecodeHintType.TRY_HARDER, true],
]);

let sharedReader: MultiFormatReader | null = null;
let sharedNativeDetector: NativeBarcodeDetector | null | undefined;
let sharedVideoCanvas: HTMLCanvasElement | null = null;
let sharedCropCanvas: HTMLCanvasElement | null = null;

function getZxingReader(): MultiFormatReader {
  if (!sharedReader) {
    sharedReader = new MultiFormatReader();
    sharedReader.setHints(ZXING_HINTS);
  }
  return sharedReader;
}

function getNativeDetector(): NativeBarcodeDetector | null {
  if (sharedNativeDetector !== undefined) {
    return sharedNativeDetector;
  }
  if (typeof window === 'undefined') {
    sharedNativeDetector = null;
    return null;
  }
  const w = window as unknown as { BarcodeDetector?: NativeBarcodeDetectorConstructor };
  if (typeof w.BarcodeDetector !== 'function') {
    sharedNativeDetector = null;
    return null;
  }
  try {
    sharedNativeDetector = new w.BarcodeDetector({ formats: NATIVE_FORMATS });
  } catch {
    try {
      sharedNativeDetector = new w.BarcodeDetector();
    } catch {
      sharedNativeDetector = null;
    }
  }
  return sharedNativeDetector;
}

export function extractBarcodeDigits(rawValue: string | null | undefined): string | null {
  if (!rawValue) return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  // Standard 1D product barcode (EAN-13, EAN-8, UPC-A, UPC-E, ITF-14)
  const digitsOnly = trimmed.replace(/[\s-]+/g, '');
  if (/^\d{6,14}$/.test(digitsOnly)) {
    return digitsOnly;
  }

  // GS1 / URL / QR payload containing an 8–14 digit product code
  const matches = trimmed.match(/\d{8,14}/g);
  if (matches && matches.length > 0) {
    // Prefer 13 or 12 digit codes
    const preferred =
      matches.find((m) => m.length === 13 || m.length === 12) ||
      matches.sort((a, b) => b.length - a.length)[0];
    return preferred || null;
  }

  return null;
}

function decodeLuminanceSource(
  source: LuminanceSource,
  useGlobalHistogram = false
): string | null {
  const reader = getZxingReader();

  try {
    reader.reset();
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));
    const result = reader.decodeWithState(bitmap);
    const code = extractBarcodeDigits(result?.getText());
    if (code) return code;
  } catch {
    // Expected when frame has no readable barcode
  }

  if (useGlobalHistogram) {
    try {
      reader.reset();
      const bitmap = new BinaryBitmap(new GlobalHistogramBinarizer(source));
      const result = reader.decodeWithState(bitmap);
      const code = extractBarcodeDigits(result?.getText());
      if (code) return code;
    } catch {
      // Ignore
    }
  }

  return null;
}

async function detectWithNative(source: ImageBitmapSource): Promise<string | null> {
  const detector = getNativeDetector();
  if (!detector) return null;
  try {
    const results = await detector.detect(source);
    for (const item of results) {
      const code = extractBarcodeDigits(item.rawValue);
      if (code) return code;
    }
  } catch {
    // Ignore native detector frame failures
  }
  return null;
}

function getCenterCropCanvas(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  if (w < 80 || h < 80) return null;

  const cropW = Math.round(w * 0.78);
  const cropH = Math.round(h * 0.56);
  const sx = Math.round((w - cropW) / 2);
  const sy = Math.round((h - cropH) / 2);

  if (!sharedCropCanvas) {
    sharedCropCanvas = document.createElement('canvas');
  }
  sharedCropCanvas.width = cropW;
  sharedCropCanvas.height = cropH;
  const ctx = sharedCropCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(sourceCanvas, sx, sy, cropW, cropH, 0, 0, cropW, cropH);
  return sharedCropCanvas;
}

function enhanceCanvasContrast(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(sourceCanvas, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;

  // High-contrast grayscale stretch to clarify low-contrast barcodes on shiny packs
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const stretched = Math.max(0, Math.min(255, (lum - 128) * 1.65 + 128));
    data[i] = stretched;
    data[i + 1] = stretched;
    data[i + 2] = stretched;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

export async function decodeCanvasBarcode(
  canvas: HTMLCanvasElement,
  thorough = false
): Promise<string | null> {
  // 1. Center crop first (sharpest view inside viewfinder box)
  const cropCanvas = getCenterCropCanvas(canvas);
  if (cropCanvas) {
    const nativeCrop = await detectWithNative(cropCanvas);
    if (nativeCrop) return nativeCrop;

    const cropSource = new HTMLCanvasElementLuminanceSource(cropCanvas, true);
    const cropCode = decodeLuminanceSource(cropSource, thorough);
    if (cropCode) return cropCode;

    if (thorough && cropSource.isRotateSupported()) {
      const rotated = cropSource.rotateCounterClockwise();
      const rotCode = decodeLuminanceSource(rotated, true);
      if (rotCode) return rotCode;
    }
  }

  // 2. Full frame
  const nativeFull = await detectWithNative(canvas);
  if (nativeFull) return nativeFull;

  const fullSource = new HTMLCanvasElementLuminanceSource(canvas, true);
  const fullCode = decodeLuminanceSource(fullSource, thorough);
  if (fullCode) return fullCode;

  if (thorough) {
    if (fullSource.isRotateSupported()) {
      const rotatedFull = fullSource.rotateCounterClockwise();
      const rotFullCode = decodeLuminanceSource(rotatedFull, true);
      if (rotFullCode) return rotFullCode;
    }

    const invertedFull = fullSource.invert();
    const invCode = decodeLuminanceSource(invertedFull, true);
    if (invCode) return invCode;

    // 3. Contrast-enhanced pass for glare/low-contrast packaging
    const contrasted = enhanceCanvasContrast(cropCanvas || canvas);
    if (contrasted) {
      const nativeContrast = await detectWithNative(contrasted);
      if (nativeContrast) return nativeContrast;

      const contrastSource = new HTMLCanvasElementLuminanceSource(contrasted, true);
      const contrastCode = decodeLuminanceSource(contrastSource, true);
      if (contrastCode) return contrastCode;

      if (contrastSource.isRotateSupported()) {
        const rotContrast = decodeLuminanceSource(contrastSource.rotateCounterClockwise(), true);
        if (rotContrast) return rotContrast;
      }
    }
  }

  return null;
}

export function drawVideoFrameToCanvas(
  videoEl: HTMLVideoElement,
  maxDim = 800
): HTMLCanvasElement | null {
  if (
    videoEl.readyState < 2 ||
    videoEl.videoWidth <= 0 ||
    videoEl.videoHeight <= 0
  ) {
    return null;
  }

  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;
  const scale = Math.min(1, maxDim / Math.max(vw, vh));
  const targetW = Math.max(1, Math.round(vw * scale));
  const targetH = Math.max(1, Math.round(vh * scale));

  if (!sharedVideoCanvas) {
    sharedVideoCanvas = document.createElement('canvas');
  }
  if (sharedVideoCanvas.width !== targetW || sharedVideoCanvas.height !== targetH) {
    sharedVideoCanvas.width = targetW;
    sharedVideoCanvas.height = targetH;
  }

  const ctx = sharedVideoCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(videoEl, 0, 0, targetW, targetH);
  return sharedVideoCanvas;
}

export async function decodeBarcodeFromVideo(
  videoEl: HTMLVideoElement,
  thorough = false
): Promise<string | null> {
  // Fast native BarcodeDetector directly on the live video element first (zero canvas copy!)
  const directNative = await detectWithNative(videoEl);
  if (directNative) return directNative;

  const canvas = drawVideoFrameToCanvas(videoEl, thorough ? 1280 : 800);
  if (!canvas) return null;
  return decodeCanvasBarcode(canvas, thorough);
}

export function captureVideoFrameJpegDataUrl(videoEl: HTMLVideoElement): string | null {
  const canvas = drawVideoFrameToCanvas(videoEl, 1440);
  if (!canvas) return null;
  return canvas.toDataURL('image/jpeg', 0.9);
}

async function loadImageFileToCanvas(file: File, maxDim = 1600): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas context unavailable');
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      return canvas;
    } catch {
      // Fallback to HTMLImageElement below
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode uploaded image'));
      el.src = objectUrl;
    });
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function decodeBarcodeFromImageFile(file: File): Promise<{
  code: string | null;
  dataUrl: string;
}> {
  const canvas = await loadImageFileToCanvas(file, 1600);
  const code = await decodeCanvasBarcode(canvas, true);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  return { code, dataUrl };
}
