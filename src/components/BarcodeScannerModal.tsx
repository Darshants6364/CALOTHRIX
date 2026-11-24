import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Barcode,
  Camera,
  Check,
  Flashlight,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  Sparkles,
  VideoOff,
  X,
} from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import { HorizontalScroller } from './HorizontalScroller';
import { lookupBarcodeApi, readBarcodeImageApi } from '../services/globalFoodApiService';
import { FoodItem, MEAL_CATEGORIES, MealCategory } from '../types';
import {
  captureVideoFrameJpegDataUrl,
  decodeBarcodeFromImageFile,
  decodeBarcodeFromVideo,
} from '../utils/barcodeDecoder';
import { formatNutrientValue } from '../utils/nutritionUtils';

const SAMPLE_INDIAN_BARCODES: { label: string; code: string }[] = [
  { label: 'Amul Gold Milk', code: '8901262150118' },
  { label: 'Pintola Peanut Butter', code: '8908006687019' },
  { label: 'Saffola Masala Oats', code: '8901088071055' },
  { label: 'Epigamia Greek Yogurt', code: '8908005471015' },
  { label: 'Amul Fresh Paneer', code: '8901262080019' },
];

function withCameraTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(label));
    }, timeoutMs);
    promise.then(
      (val) => {
        window.clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export const BarcodeScannerModal: React.FC = () => {
  const { barcodeScannerModal } = useMacroLogStore();
  if (!barcodeScannerModal.isOpen) return null;
  return <BarcodeScannerModalContent />;
};

const BarcodeScannerModalContent: React.FC = () => {
  const {
    allFoods,
    barcodeScannerModal,
    closeBarcodeScannerModal,
    openAddFoodModal,
    openMealScannerModal,
    notify,
  } = useMacroLogStore();

  const [manualBarcode, setManualBarcode] = useState('');
  const modalContainerRef = useRef<HTMLDivElement | null>(null);
  useModalFocusTrap(modalContainerRef, true, closeBarcodeScannerModal);
  const [mealType, setMealType] = useState<MealCategory>('lunch');
  const [logDate, setLogDate] = useState(barcodeScannerModal.targetDate);
  const [lookingUp, setLookingUp] = useState(false);
  const [decodingImage, setDecodingImage] = useState(false);
  const [matchedFood, setMatchedFood] = useState<FoodItem | null>(null);
  const [lastSearchedCode, setLastSearchedCode] = useState('');
  const [error, setError] = useState('');

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [previewStalled, setPreviewStalled] = useState(false);
  const [cameraSessionId, setCameraSessionId] = useState(0);
  const [cameraMessage, setCameraMessage] = useState('');
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>('');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const scanBusyRef = useRef<boolean>(false);
  const detectLockRef = useRef<boolean>(false);
  const frameCountRef = useRef<number>(0);
  const startAttemptRef = useRef<number>(0);
  const isOpenRef = useRef<boolean>(barcodeScannerModal.isOpen);

  const stopCamera = useCallback(() => {
    startAttemptRef.current += 1;
    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // Ignore track stop errors
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {
        // Ignore pause errors
      }
      videoRef.current.srcObject = null;
    }
    scanBusyRef.current = false;
    setCameraActive(false);
    setCameraStarting(false);
    setCameraReady(false);
    setPreviewStalled(false);
    setTorchSupported(false);
    setTorchEnabled(false);
  }, []);

  useEffect(() => {
    isOpenRef.current = barcodeScannerModal.isOpen;
    if (!barcodeScannerModal.isOpen) {
      stopCamera();
      return;
    }

    setMealType(barcodeScannerModal.initialMeal);
    setLogDate(barcodeScannerModal.targetDate);
    setManualBarcode('');
    setMatchedFood(null);
    setLastSearchedCode('');
    setError('');
    setCameraMessage('');
    setDecodingImage(false);
    detectLockRef.current = false;

    return () => {
      stopCamera();
    };
  }, [
    barcodeScannerModal.isOpen,
    barcodeScannerModal.initialMeal,
    barcodeScannerModal.targetDate,
    stopCamera,
  ]);

  const handleLookupCode = useCallback(
    async (rawCode: string) => {
      const cleaned = rawCode.replace(/\D/g, '').trim();
      if (!cleaned || cleaned.length < 6) {
        setError('Enter a valid 8–14 digit barcode number (e.g. 8901262150118).');
        return;
      }

      stopCamera();
      setError('');
      setLookingUp(true);
      setMatchedFood(null);
      setManualBarcode(cleaned);
      setLastSearchedCode(cleaned);

      try {
        const candidates = [cleaned];
        if (cleaned.length === 13 && cleaned.startsWith('0')) {
          candidates.push(cleaned.slice(1));
        } else if (cleaned.length === 12) {
          candidates.push(`0${cleaned}`);
        }

        // 1. Check local curated & custom foods first (instant, works offline)
        const localMatch = allFoods.find(
          (f) => f.barcode && candidates.includes(f.barcode.replace(/\D/g, ''))
        );
        if (localMatch) {
          setMatchedFood(localMatch);
          return;
        }

        // 2. Query Open Food Facts (routes 890* to in.openfoodfacts.org first)
        const res = await lookupBarcodeApi(cleaned);
        if (res.item) {
          setMatchedFood(res.item);
        } else {
          setError(
            res.error ||
              `Barcode ${cleaned} was not found in Open Food Facts or local records. Try scanning the nutrition label with Photo AI or creating a Custom Food.`
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to look up barcode right now.');
      } finally {
        setLookingUp(false);
        detectLockRef.current = false;
      }
    },
    [allFoods, stopCamera]
  );

  // Keep stable refs so background store updates never tear down the active camera scan loop
  const handleLookupCodeRef = useRef(handleLookupCode);
  const notifyRef = useRef(notify);
  useEffect(() => {
    handleLookupCodeRef.current = handleLookupCode;
    notifyRef.current = notify;
  }, [handleLookupCode, notify]);

  // Live continuous barcode scanning loop (native BarcodeDetector + fast ZXing)
  useEffect(() => {
    if (!cameraActive || cameraSessionId === 0) return;
    const videoEl = videoRef.current;
    const stream = streamRef.current;
    if (!videoEl || !stream) return;

    let cancelled = false;
    detectLockRef.current = false;
    scanBusyRef.current = false;
    frameCountRef.current = 0;

    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
    }

    const markReadyIfFramesAvailable = () => {
      if (cancelled) return false;
      if (videoEl.videoWidth > 0 && videoEl.readyState >= 2) {
        setCameraReady(true);
        setPreviewStalled(false);
        return true;
      }
      return false;
    };

    const tryPlay = async () => {
      if (cancelled) return;
      try {
        videoEl.muted = true;
        await videoEl.play();
      } catch {
        // Some strict mobile webviews require a direct tap if autoplay was blocked
      }
      markReadyIfFramesAvailable();
    };

    const handleReady = () => {
      markReadyIfFramesAvailable();
      if (videoEl.paused) {
        void tryPlay();
      }
    };

    videoEl.addEventListener('loadedmetadata', handleReady);
    videoEl.addEventListener('loadeddata', handleReady);
    videoEl.addEventListener('canplay', handleReady);
    videoEl.addEventListener('playing', handleReady);
    videoEl.addEventListener('resize', handleReady);

    if (!markReadyIfFramesAvailable()) {
      void tryPlay();
    }

    // Fallback readiness poll + stall detector (never spin forever on "Starting camera preview...")
    const startedAt = Date.now();
    const readyInterval = window.setInterval(() => {
      if (cancelled) {
        window.clearInterval(readyInterval);
        return;
      }
      if (markReadyIfFramesAvailable()) {
        window.clearInterval(readyInterval);
        return;
      }
      if (videoEl.paused) {
        void tryPlay();
      }
      if (Date.now() - startedAt > 4000) {
        setPreviewStalled(true);
      }
    }, 200);

    const scheduleNextScan = (delayMs: number) => {
      if (cancelled || detectLockRef.current) return;
      scanTimerRef.current = window.setTimeout(() => {
        void runScanTick();
      }, delayMs);
    };

    const runScanTick = async () => {
      if (cancelled || !streamRef.current || !videoRef.current || detectLockRef.current) {
        return;
      }

      if (
        !scanBusyRef.current &&
        videoEl.readyState >= 2 &&
        videoEl.videoWidth > 0
      ) {
        setCameraReady(true);
        setPreviewStalled(false);
        scanBusyRef.current = true;
        frameCountRef.current += 1;
        // Run thorough pass every 5th tick to keep mobile UI silky smooth
        const thorough = frameCountRef.current % 5 === 0;

        try {
          const detectedCode = await decodeBarcodeFromVideo(videoEl, thorough);
          if (detectedCode && !cancelled && !detectLockRef.current) {
            detectLockRef.current = true;
            notifyRef.current(`Detected barcode ${detectedCode}`);
            void handleLookupCodeRef.current(detectedCode);
            return;
          }
        } catch {
          // Ignore transient frame decode errors
        } finally {
          scanBusyRef.current = false;
        }
      }

      scheduleNextScan(220);
    };

    scheduleNextScan(260);

    return () => {
      cancelled = true;
      scanBusyRef.current = false;
      window.clearInterval(readyInterval);
      if (scanTimerRef.current !== null) {
        window.clearTimeout(scanTimerRef.current);
        scanTimerRef.current = null;
      }
      videoEl.removeEventListener('loadedmetadata', handleReady);
      videoEl.removeEventListener('loadeddata', handleReady);
      videoEl.removeEventListener('canplay', handleReady);
      videoEl.removeEventListener('playing', handleReady);
      videoEl.removeEventListener('resize', handleReady);
    };
  }, [cameraActive, cameraSessionId]);

  const startCameraScanner = async (preferredDeviceId?: string) => {
    setError('');
    setCameraMessage('');

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraMessage(
        'Live camera preview is unavailable in this browser. Tap "Take Photo" to snap a barcode with your phone camera, or enter the digits below.'
      );
      return;
    }

    stopCamera();
    const attemptId = startAttemptRef.current;
    setCameraStarting(true);
    setPreviewStalled(false);

    const requestStream = async (): Promise<MediaStream> => {
      // Tier 1: Preferred rear camera (or selected device) with safe mobile-friendly HD ideal
      try {
        return await withCameraTimeout(
          navigator.mediaDevices.getUserMedia({
            video: preferredDeviceId
              ? {
                  deviceId: { exact: preferredDeviceId },
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                }
              : {
                  facingMode: { ideal: 'environment' },
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                },
            audio: false,
          }),
          9000,
          'Camera startup timed out. Allow camera permission or tap "Take Photo" below.'
        );
      } catch (firstErr) {
        if (
          firstErr instanceof DOMException &&
          (firstErr.name === 'NotAllowedError' || firstErr.name === 'PermissionDeniedError')
        ) {
          throw firstErr;
        }
        // Tier 2: Plain rear camera constraint
        try {
          return await withCameraTimeout(
            navigator.mediaDevices.getUserMedia({
              video: preferredDeviceId
                ? { deviceId: { ideal: preferredDeviceId } }
                : { facingMode: 'environment' },
              audio: false,
            }),
            7000,
            'Camera startup timed out. Allow camera permission or tap "Take Photo" below.'
          );
        } catch (secondErr) {
          if (
            secondErr instanceof DOMException &&
            (secondErr.name === 'NotAllowedError' || secondErr.name === 'PermissionDeniedError')
          ) {
            throw secondErr;
          }
          // Tier 3: Universal fallback (laptop webcams / single-camera mobile webviews)
          return await withCameraTimeout(
            navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            }),
            7000,
            'Camera startup timed out. Tap "Take Photo" or enter the barcode manually below.'
          );
        }
      }
    };

    try {
      const stream = await requestStream();

      if (!isOpenRef.current || startAttemptRef.current !== attemptId) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      // Immediately attach stream to the always-mounted <video> element while user gesture is fresh
      const videoEl = videoRef.current;
      if (videoEl) {
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.setAttribute('playsinline', 'true');
        videoEl.setAttribute('muted', 'true');
        videoEl.srcObject = stream;
        try {
          await videoEl.play();
        } catch {
          // Handled by ready listeners & tap-to-resume fallback
        }
      }

      const readyNow = Boolean(videoEl && videoEl.videoWidth > 0 && videoEl.readyState >= 2);
      setCameraReady(readyNow);
      setCameraActive(true);
      setCameraStarting(false);
      setCameraSessionId((n) => n + 1);

      // Run autofocus, torch detection & camera enumeration non-blocking in the background
      const track = stream.getVideoTracks()[0];
      if (track) {
        const settings = track.getSettings?.();
        if (settings?.deviceId) {
          setActiveDeviceId(settings.deviceId);
        }
        void (async () => {
          try {
            const caps = track.getCapabilities?.() as
              | (MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean })
              | undefined;
            if (isOpenRef.current && startAttemptRef.current === attemptId) {
              setTorchSupported(Boolean(caps?.torch));
              if (caps?.focusMode?.includes('continuous')) {
                await track.applyConstraints({
                  advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
                });
              }
            }
          } catch {
            // Best-effort only; never block preview
          }
        })();
      }

      void (async () => {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (isOpenRef.current && startAttemptRef.current === attemptId) {
            setCameraDevices(devices.filter((d) => d.kind === 'videoinput'));
          }
        } catch {
          // Best-effort only
        }
      })();
    } catch (err) {
      if (startAttemptRef.current !== attemptId) return;
      setCameraStarting(false);
      setCameraActive(false);
      setCameraReady(false);

      const errName = err instanceof DOMException ? err.name : '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setCameraMessage(
          'Camera permission was blocked. Allow camera access in your browser settings, or tap "Take Photo" to scan a barcode photo.'
        );
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setCameraMessage(
          'No live camera was detected on this device. Upload a barcode photo or enter the barcode digits below.'
        );
      } else if (err instanceof Error && err.message) {
        setCameraMessage(err.message);
      } else {
        setCameraMessage(
          'Unable to start live camera preview. Tap "Take Photo" to scan with your phone camera, or enter the digits below.'
        );
      }
    }
  };

  const handleResumeVideo = async () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    try {
      videoEl.muted = true;
      await videoEl.play();
      if (videoEl.videoWidth > 0) {
        setCameraReady(true);
        setPreviewStalled(false);
      }
    } catch {
      setCameraMessage(
        'Live video playback was blocked in this browser view. Tap "Take Photo" to capture the barcode directly.'
      );
      stopCamera();
    }
  };

  const handleSwitchCamera = () => {
    if (cameraDevices.length < 2) return;
    const currentIdx = cameraDevices.findIndex((d) => d.deviceId === activeDeviceId);
    const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % cameraDevices.length : 0;
    const nextDevice = cameraDevices[nextIdx];
    if (nextDevice) {
      void startCameraScanner(nextDevice.deviceId);
    }
  };

  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchEnabled;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchEnabled(next);
    } catch {
      notify('Flashlight control is not supported on this camera');
    }
  };

  const handleSnapAndReadFrame = async () => {
    const videoEl = videoRef.current;
    if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth <= 0) {
      setError('Camera preview is still warming up. Wait a moment or tap "Take Photo" below.');
      return;
    }

    setError('');
    setDecodingImage(true);
    try {
      // 1. Thorough optical barcode pass first
      const opticalCode = await decodeBarcodeFromVideo(videoEl, true);
      if (opticalCode) {
        detectLockRef.current = true;
        notify(`Detected barcode ${opticalCode}`);
        void handleLookupCode(opticalCode);
        return;
      }

      // 2. Fallback: Gemini Vision reads the printed digits underneath the bars
      const frameDataUrl = captureVideoFrameJpegDataUrl(videoEl);
      if (frameDataUrl) {
        const aiRes = await readBarcodeImageApi(frameDataUrl);
        if (aiRes.barcode) {
          detectLockRef.current = true;
          notify(`Read barcode ${aiRes.barcode}`);
          void handleLookupCode(aiRes.barcode);
          return;
        }
      }

      setError(
        'Could not read a clear barcode from that frame. Move closer in bright light so the bars & numbers fill the green frame, or type the digits below.'
      );
    } catch {
      setError('Unable to capture barcode frame right now. Please try typing the digits below.');
    } finally {
      setDecodingImage(false);
    }
  };

  const handleBarcodeImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    stopCamera();
    setError('');
    setCameraMessage('');
    setDecodingImage(true);

    try {
      const { code, dataUrl } = await decodeBarcodeFromImageFile(file);
      if (code) {
        notify(`Barcode ${code} detected from image`);
        void handleLookupCode(code);
        return;
      }

      // Optical bars were blurred or had glare — fall back to reading the printed digits with AI
      const aiRes = await readBarcodeImageApi(dataUrl);
      if (aiRes.barcode) {
        notify(`Barcode ${aiRes.barcode} read from image`);
        void handleLookupCode(aiRes.barcode);
        return;
      }

      setError(
        'No barcode could be read clearly from that image. Hold the camera closer in good lighting or enter the barcode digits manually.'
      );
    } catch {
      setError('Could not scan barcode from the selected image. Please enter the digits manually.');
    } finally {
      setDecodingImage(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleLookupCode(manualBarcode);
  };

  const handleProceedToLog = () => {
    if (!matchedFood) return;
    const pickedFood = matchedFood;
    closeBarcodeScannerModal();
    openAddFoodModal({
      food: pickedFood,
      meal: mealType,
      date: logDate,
    });
  };

  return (
    <div
      className="mobile-modal-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Barcode Food Scanner"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeBarcodeScannerModal();
      }}
    >
      <div
        ref={modalContainerRef}
        className="mobile-modal-sheet w-full sm:max-w-lg max-h-[92dvh] flex flex-col bg-white dark:bg-[#111317] rounded-t-3xl sm:rounded-2xl border border-black/10 dark:border-white/12 shadow-2xl overflow-hidden overscroll-contain"
      >
        <div className="sm:hidden w-10 h-1.5 bg-stone-300 dark:bg-slate-700 rounded-full mx-auto mt-2.5 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b border-black/10 dark:border-white/12 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-lime-500/15 text-lime-700 dark:text-lime-400 flex items-center justify-center shrink-0">
              <Barcode className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] sm:text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
                Barcode Scanner
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                India (890…) &amp; Global UPC/EAN lookup
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeBarcodeScannerModal}
            aria-label="Close barcode scanner"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-stone-100 dark:hover:bg-slate-800 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-3.5 sm:space-y-4">
          {/* Meal & Date selector */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Meal Slot
              </label>
              <select
                value={mealType}
                onChange={(e) => setMealType(e.target.value as MealCategory)}
                className="w-full h-10 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs font-medium text-slate-900 dark:text-slate-100"
              >
                {MEAL_CATEGORIES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Log Date
              </label>
              <input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs font-medium text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Hidden native camera & gallery file inputs (shared by controls) */}
          <input
            ref={cameraPhotoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={decodingImage}
            onChange={handleBarcodeImageUpload}
            className="sr-only"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            disabled={decodingImage}
            onChange={handleBarcodeImageUpload}
            className="sr-only"
          />

          {/* Camera / Image Scan Box — <video> stays mounted so startCameraScanner binds directly in user gesture */}
          <div
            className={`rounded-2xl border border-black/10 dark:border-white/12 bg-stone-50/70 dark:bg-[#090A0C]/70 overflow-hidden ${
              matchedFood ? 'hidden' : ''
            }`}
          >
            <div className={cameraActive ? 'block' : 'hidden'}>
              <div className="relative bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  disablePictureInPicture
                  className="w-full h-56 sm:h-60 object-cover bg-black"
                />
                {!cameraReady && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-black/80 text-white text-xs px-4 text-center">
                    <Loader2 className="w-5 h-5 animate-spin text-[#C8FF00]" />
                    <span>
                      {previewStalled
                        ? 'Camera stream is paused by your browser.'
                        : 'Starting camera preview...'}
                    </span>
                    {previewStalled && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => void handleResumeVideo()}
                          className="min-h-[38px] px-3 rounded-xl bg-[#C8FF00] text-black text-xs font-semibold"
                        >
                          Tap to Resume
                        </button>
                        <button
                          type="button"
                          onClick={() => cameraPhotoInputRef.current?.click()}
                          className="min-h-[38px] px-3 rounded-xl bg-white/15 text-white text-xs font-semibold"
                        >
                          Take Photo Instead
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {cameraReady && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <div className="w-60 sm:w-64 h-24 sm:h-28 rounded-xl border-2 border-lime-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.38)] flex items-center justify-center">
                      <div className="w-full h-0.5 bg-lime-400/80 animate-pulse" />
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-black/65 text-[10px] font-medium text-white/90">
                      Align barcode inside frame
                    </span>
                  </div>
                )}

                <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {torchSupported && (
                      <button
                        type="button"
                        onClick={() => void handleToggleTorch()}
                        className={`min-h-[36px] px-2.5 rounded-xl text-xs font-medium inline-flex items-center gap-1 transition-colors ${
                          torchEnabled
                            ? 'bg-lime-400 text-slate-950'
                            : 'bg-black/70 text-white hover:bg-black/85'
                        }`}
                      >
                        <Flashlight className="w-3.5 h-3.5" />
                        {torchEnabled ? 'Light On' : 'Light'}
                      </button>
                    )}
                    {cameraDevices.length > 1 && (
                      <button
                        type="button"
                        onClick={handleSwitchCamera}
                        className="min-h-[36px] px-2.5 rounded-xl bg-black/70 text-white text-xs font-medium inline-flex items-center gap-1 hover:bg-black/85"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Lens
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={stopCamera}
                    className="min-h-[36px] px-3 rounded-xl bg-black/70 text-white text-xs font-medium inline-flex items-center gap-1.5 hover:bg-black/85"
                  >
                    <VideoOff className="w-3.5 h-3.5" />
                    Stop
                  </button>
                </div>
              </div>

              <div className="p-2.5 bg-white dark:bg-[#111317] border-t border-black/10 dark:border-white/12 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {cameraReady ? 'Auto-scanning live…' : 'Warming up lens…'}
                </span>
                <button
                  type="button"
                  onClick={() => void handleSnapAndReadFrame()}
                  disabled={decodingImage}
                  className="min-h-[38px] px-3 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {decodingImage ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ScanLine className="w-3.5 h-3.5" />
                  )}
                  {decodingImage ? 'Reading...' : 'Snap & Read'}
                </button>
              </div>
            </div>

            {!cameraActive && (
              <div className="p-3.5 sm:p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void startCameraScanner()}
                    disabled={cameraStarting || decodingImage}
                    className="flex-1 min-h-[46px] px-4 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60 whitespace-nowrap"
                  >
                    {cameraStarting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                    {cameraStarting ? 'Starting Camera...' : 'Start Live Camera Scan'}
                  </button>

                  {cameraStarting && (
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="min-h-[46px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#111317] text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={decodingImage}
                    onClick={() => cameraPhotoInputRef.current?.click()}
                    className="min-h-[44px] px-3 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-lime-500 inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                  >
                    {decodingImage ? (
                      <Loader2 className="w-4 h-4 animate-spin text-lime-600 dark:text-lime-400" />
                    ) : (
                      <ScanLine className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                    )}
                    <span>{decodingImage ? 'Reading...' : 'Take Photo'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={decodingImage}
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[44px] px-3 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-lime-500 inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                  >
                    <ImagePlus className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                    <span>Upload Image</span>
                  </button>
                </div>
              </div>
            )}

            {cameraMessage && (
              <div className="px-4 py-2.5 border-t border-black/10 dark:border-white/12 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
                {cameraMessage}
              </div>
            )}
          </div>

          {!matchedFood && (
            <>
              {/* Manual Barcode Entry */}
              <form onSubmit={handleManualSubmit} className="space-y-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Or Enter Barcode Number (EAN-13 / UPC-A)
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1 min-w-0">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={manualBarcode}
                      onChange={(e) => setManualBarcode(e.target.value)}
                      placeholder="e.g., 8901262150118"
                      className="w-full h-11 pl-10 pr-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/70 dark:bg-[#090A0C] text-base sm:text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={lookingUp}
                    className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-semibold hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0"
                  >
                    {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lookup'}
                  </button>
                </div>
              </form>

              {/* Quick Indian Packaged Product Chips — Horizontal Scroller */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Quick test — Popular Indian packaged foods (890…):
                </div>
                <HorizontalScroller ariaLabel="Sample Indian barcodes" contentClassName="gap-1.5 pb-0.5">
                  {SAMPLE_INDIAN_BARCODES.map((sample) => (
                    <button
                      key={sample.code}
                      type="button"
                      onClick={() => void handleLookupCode(sample.code)}
                      className="min-h-[36px] px-2.5 rounded-lg border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:border-lime-500 transition-colors whitespace-nowrap shrink-0"
                    >
                      {sample.label}
                    </button>
                  ))}
                </HorizontalScroller>
              </div>
            </>
          )}

          {/* Error / Not found state */}
          {error && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 space-y-2.5">
              <p>{error}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    closeBarcodeScannerModal();
                    openMealScannerModal({ mode: 'label', meal: mealType, date: logDate });
                  }}
                  className="min-h-[36px] px-3 rounded-lg bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 font-semibold inline-flex items-center gap-1.5"
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  Scan Nutrition Label
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeBarcodeScannerModal();
                    openMealScannerModal({ mode: 'photo', meal: mealType, date: logDate });
                  }}
                  className="min-h-[36px] px-3 rounded-lg border border-amber-300 dark:border-amber-700 font-semibold inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Photo AI
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeBarcodeScannerModal();
                    openAddFoodModal({ meal: mealType, date: logDate });
                  }}
                  className="min-h-[36px] px-3 rounded-lg border border-amber-300 dark:border-amber-700 font-semibold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create Custom Food
                </button>
              </div>
            </div>
          )}

          {/* Found Product Preview Card */}
          {matchedFood && (
            <div className="rounded-2xl border border-lime-300 dark:border-lime-800/70 bg-lime-50/40 dark:bg-lime-950/20 p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-lime-700 dark:text-lime-400">
                      Product Found
                    </span>
                    <span className="text-[11px] font-mono-nums text-slate-500 dark:text-slate-400">
                      · #{matchedFood.barcode || lastSearchedCode}
                    </span>
                  </div>
                  <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-slate-50">
                    {matchedFood.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {matchedFood.brand ? `${matchedFood.brand} · ` : ''}
                    {matchedFood.servingName}
                    {matchedFood.country ? ` · ${matchedFood.country}` : ''}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMatchedFood(null);
                    setError('');
                  }}
                  className="min-h-[36px] px-2.5 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-[#090A0C] text-[11px] font-medium text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  Scan Again
                </button>
              </div>

              <div className="grid grid-cols-5 gap-1.5 sm:gap-2 text-center">
                <div className="py-2 px-1 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Kcal</div>
                  <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 font-mono-nums mt-0.5">
                    {formatNutrientValue(matchedFood, 'calories')}
                  </div>
                </div>
                <div className="py-2 px-1 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Protein</div>
                  <div className="text-xs sm:text-sm font-bold text-lime-700 dark:text-lime-400 font-mono-nums mt-0.5">
                    {formatNutrientValue(matchedFood, 'protein', 'g')}
                  </div>
                </div>
                <div className="py-2 px-1 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Carbs</div>
                  <div className="text-xs sm:text-sm font-bold text-amber-700 dark:text-amber-400 font-mono-nums mt-0.5">
                    {formatNutrientValue(matchedFood, 'carbs', 'g')}
                  </div>
                </div>
                <div className="py-2 px-1 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Fat</div>
                  <div className="text-xs sm:text-sm font-bold text-indigo-700 dark:text-indigo-400 font-mono-nums mt-0.5">
                    {formatNutrientValue(matchedFood, 'fat', 'g')}
                  </div>
                </div>
                <div className="py-2 px-1 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Fibre</div>
                  <div className="text-xs sm:text-sm font-bold text-teal-700 dark:text-teal-400 font-mono-nums mt-0.5">
                    {formatNutrientValue(matchedFood, 'fibre', 'g')}
                  </div>
                </div>
              </div>

              {matchedFood.ingredientsText && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                  Ingredients: {matchedFood.ingredientsText}
                </p>
              )}

              <div className="text-[11px] text-slate-400">
                Source: {matchedFood.sourceName || 'Open Food Facts'}
                {matchedFood.license ? ` · ${matchedFood.license}` : ''}
              </div>

              <button
                type="button"
                onClick={handleProceedToLog}
                className="w-full min-h-[48px] rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Set Quantity &amp; Add to Food Log
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
