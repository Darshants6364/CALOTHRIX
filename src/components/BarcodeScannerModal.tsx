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

export const BarcodeScannerModal: React.FC = () => {
  const {
    allFoods,
    barcodeScannerModal,
    closeBarcodeScannerModal,
    openAddFoodModal,
    openMealScannerModal,
    notify,
  } = useMacroLogStore();

  const [manualBarcode, setManualBarcode] = useState('');
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
  const [cameraMessage, setCameraMessage] = useState('');
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>('');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastScanCheckRef = useRef<number>(0);
  const scanBusyRef = useRef<boolean>(false);
  const detectLockRef = useRef<boolean>(false);
  const frameCountRef = useRef<number>(0);
  const isOpenRef = useRef<boolean>(barcodeScannerModal.isOpen);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    scanBusyRef.current = false;
    setCameraActive(false);
    setCameraStarting(false);
    setCameraReady(false);
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

  // Live continuous barcode scanning (ZXing multi-pass + native BarcodeDetector)
  useEffect(() => {
    if (!cameraActive) return;
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

    const tryPlay = async () => {
      if (cancelled) return;
      try {
        await videoEl.play();
      } catch {
        // Fallback handled by autoPlay + playsInline + muted or ready listeners
      }
    };

    const handleReady = () => {
      if (cancelled) return;
      if (videoEl.videoWidth > 0 || videoEl.readyState >= 2) {
        setCameraReady(true);
      }
      void tryPlay();
    };

    videoEl.addEventListener('loadedmetadata', handleReady);
    videoEl.addEventListener('loadeddata', handleReady);
    videoEl.addEventListener('canplay', handleReady);
    videoEl.addEventListener('playing', handleReady);

    if (videoEl.readyState >= 2 || videoEl.videoWidth > 0) {
      setCameraReady(true);
    }
    void tryPlay();

    const scanFrame = async (timestamp: number) => {
      if (cancelled || !streamRef.current || !videoRef.current || detectLockRef.current) {
        return;
      }

      if (
        !scanBusyRef.current &&
        timestamp - lastScanCheckRef.current >= 180 &&
        videoEl.readyState >= 2 &&
        videoEl.videoWidth > 0
      ) {
        lastScanCheckRef.current = timestamp;
        scanBusyRef.current = true;
        frameCountRef.current += 1;
        const thorough = frameCountRef.current % 3 === 0;

        try {
          const detectedCode = await decodeBarcodeFromVideo(videoEl, thorough);
          if (detectedCode && !cancelled && !detectLockRef.current) {
            detectLockRef.current = true;
            notify(`Detected barcode ${detectedCode}`);
            void handleLookupCode(detectedCode);
            return;
          }
        } catch {
          // Ignore transient frame decode errors
        } finally {
          scanBusyRef.current = false;
        }
      }

      if (!cancelled && !detectLockRef.current) {
        rafRef.current = window.requestAnimationFrame((t) => {
          void scanFrame(t);
        });
      }
    };

    rafRef.current = window.requestAnimationFrame((t) => {
      void scanFrame(t);
    });

    return () => {
      cancelled = true;
      scanBusyRef.current = false;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      videoEl.removeEventListener('loadedmetadata', handleReady);
      videoEl.removeEventListener('loadeddata', handleReady);
      videoEl.removeEventListener('canplay', handleReady);
      videoEl.removeEventListener('playing', handleReady);
    };
  }, [cameraActive, handleLookupCode, notify]);

  const startCameraScanner = async (preferredDeviceId?: string) => {
    setError('');
    setCameraMessage('');

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraMessage(
        'Live camera access is unavailable in this browser context. Upload a pack photo or enter the barcode digits below.'
      );
      return;
    }

    stopCamera();
    setCameraStarting(true);

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: preferredDeviceId
            ? {
                deviceId: { exact: preferredDeviceId },
                width: { ideal: 1920, min: 640 },
                height: { ideal: 1080, min: 480 },
              }
            : {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920, min: 640 },
                height: { ideal: 1080, min: 480 },
              },
          audio: false,
        });
      } catch {
        // Fallback for older webcams / constraints mismatch
        stream = await navigator.mediaDevices.getUserMedia({
          video: preferredDeviceId
            ? { deviceId: { exact: preferredDeviceId } }
            : { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      }

      if (!isOpenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const track = stream.getVideoTracks()[0];
      if (track) {
        const settings = track.getSettings?.();
        if (settings?.deviceId) {
          setActiveDeviceId(settings.deviceId);
        }
        // Best-effort continuous autofocus + torch detection
        try {
          const caps = track.getCapabilities?.() as
            | (MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean })
            | undefined;
          if (caps?.focusMode?.includes('continuous')) {
            await track.applyConstraints({
              advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
            });
          }
          setTorchSupported(Boolean(caps?.torch));
        } catch {
          setTorchSupported(false);
        }
      }

      // Enumerate available cameras so user can switch if ultra-wide lens is selected
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCameraDevices(devices.filter((d) => d.kind === 'videoinput'));
      } catch {
        setCameraDevices([]);
      }

      streamRef.current = stream;
      setCameraReady(false);
      setCameraActive(true);
      setCameraStarting(false);
    } catch {
      setCameraStarting(false);
      setCameraActive(false);
      setCameraReady(false);
      setCameraMessage(
        'Camera permission denied or no camera detected. You can upload a barcode photo or enter the digits manually below.'
      );
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
      setError('Camera preview is still warming up. Please wait a moment and try again.');
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

  if (!barcodeScannerModal.isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Barcode Food Scanner"
    >
      <div className="w-full sm:max-w-lg max-h-[92dvh] flex flex-col bg-white dark:bg-[#111317] rounded-t-3xl sm:rounded-2xl border border-black/10 dark:border-white/12 shadow-2xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-stone-300 dark:bg-slate-700 rounded-full mx-auto mt-3 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-black/10 dark:border-white/12 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-lime-500/15 text-lime-700 dark:text-lime-400 flex items-center justify-center shrink-0">
              <Barcode className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
                Barcode Scanner
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Instant lookup across Open Food Facts India (890…) & Global UPC/EAN
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeBarcodeScannerModal}
            aria-label="Close barcode scanner"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-stone-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
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

          {!matchedFood && (
            <>
              {/* Camera / Image Scan Box */}
              <div className="rounded-2xl border border-black/10 dark:border-white/12 bg-stone-50/70 dark:bg-[#090A0C]/70 overflow-hidden">
                {cameraActive ? (
                  <div>
                    <div className="relative bg-black">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-60 object-cover bg-black"
                      />
                      {!cameraReady && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 text-white text-xs pointer-events-none">
                          <Loader2 className="w-5 h-5 animate-spin text-[#C8FF00]" />
                          <span>Starting camera preview...</span>
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <div className="w-64 h-28 rounded-xl border-2 border-lime-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.38)] flex items-center justify-center">
                          <div className="w-full h-0.5 bg-lime-400/80 animate-pulse" />
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full bg-black/65 text-[10px] font-medium text-white/90">
                          Align barcode inside frame
                        </span>
                      </div>

                      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {torchSupported && (
                            <button
                              type="button"
                              onClick={() => void handleToggleTorch()}
                              className={`px-2.5 py-1.5 rounded-xl text-xs font-medium inline-flex items-center gap-1 transition-colors ${
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
                              className="px-2.5 py-1.5 rounded-xl bg-black/70 text-white text-xs font-medium inline-flex items-center gap-1 hover:bg-black/85"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              Switch Lens
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={stopCamera}
                          className="px-3 py-1.5 rounded-xl bg-black/70 text-white text-xs font-medium inline-flex items-center gap-1.5 hover:bg-black/85"
                        >
                          <VideoOff className="w-3.5 h-3.5" />
                          Stop
                        </button>
                      </div>
                    </div>

                    <div className="p-2.5 bg-white dark:bg-[#111317] border-t border-black/10 dark:border-white/12 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Auto-scanning live…
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleSnapAndReadFrame()}
                        disabled={decodingImage || !cameraReady}
                        className="min-h-[36px] px-3 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50"
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
                ) : (
                  <div className="p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => void startCameraScanner()}
                      disabled={cameraStarting || decodingImage}
                      className="flex-1 min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60"
                    >
                      {cameraStarting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Camera className="w-4 h-4" />
                      )}
                      {cameraStarting ? 'Starting Camera...' : 'Start Live Camera Scan'}
                    </button>

                    <label className="min-h-[44px] px-4 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-lime-500 inline-flex items-center justify-center gap-2 cursor-pointer">
                      {decodingImage ? (
                        <Loader2 className="w-4 h-4 animate-spin text-lime-600 dark:text-lime-400" />
                      ) : (
                        <ImagePlus className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                      )}
                      <span>{decodingImage ? 'Reading Barcode...' : 'Upload Barcode Photo'}</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        disabled={decodingImage}
                        onChange={handleBarcodeImageUpload}
                        className="sr-only"
                      />
                    </label>
                  </div>
                )}

                {cameraMessage && (
                  <div className="px-4 py-2.5 border-t border-black/10 dark:border-white/12 text-[11px] text-slate-500 dark:text-slate-400">
                    {cameraMessage}
                  </div>
                )}
              </div>

              {/* Manual Barcode Entry */}
              <form onSubmit={handleManualSubmit} className="space-y-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Or Enter Barcode Number (EAN-13 / UPC-A)
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={manualBarcode}
                      onChange={(e) => setManualBarcode(e.target.value)}
                      placeholder="e.g., 8901262150118"
                      className="w-full h-11 pl-10 pr-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/70 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
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

              {/* Quick Indian Packaged Product Chips */}
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Quick test — Popular Indian packaged foods (890…):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_INDIAN_BARCODES.map((sample) => (
                    <button
                      key={sample.code}
                      type="button"
                      onClick={() => void handleLookupCode(sample.code)}
                      className="px-2.5 py-1.5 rounded-lg border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:border-lime-500 transition-colors"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>
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
                    openMealScannerModal({ mode: 'photo', meal: mealType, date: logDate });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 font-semibold inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Scan Pack with Photo AI
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeBarcodeScannerModal();
                    openAddFoodModal({ meal: mealType, date: logDate });
                  }}
                  className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 font-semibold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Search / Create Custom Food
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
                  className="px-2.5 py-1.5 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-[#090A0C] text-[11px] font-medium text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  Scan Again
                </button>
              </div>

              <div className="grid grid-cols-5 gap-2 text-center">
                <div className="py-2 px-1 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Calories</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono-nums mt-0.5">
                    {formatNutrientValue(matchedFood, 'calories')}
                  </div>
                </div>
                <div className="py-2 px-1 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Protein</div>
                  <div className="text-sm font-bold text-lime-700 dark:text-lime-400 font-mono-nums mt-0.5">
                    {formatNutrientValue(matchedFood, 'protein', 'g')}
                  </div>
                </div>
                <div className="py-2 px-1 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Carbs</div>
                  <div className="text-sm font-bold text-amber-700 dark:text-amber-400 font-mono-nums mt-0.5">
                    {formatNutrientValue(matchedFood, 'carbs', 'g')}
                  </div>
                </div>
                <div className="py-2 px-1 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Fat</div>
                  <div className="text-sm font-bold text-indigo-700 dark:text-indigo-400 font-mono-nums mt-0.5">
                    {formatNutrientValue(matchedFood, 'fat', 'g')}
                  </div>
                </div>
                <div className="py-2 px-1 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Fibre</div>
                  <div className="text-sm font-bold text-teal-700 dark:text-teal-400 font-mono-nums mt-0.5">
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
                className="w-full min-h-[46px] rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Set Quantity & Add to Food Log
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
