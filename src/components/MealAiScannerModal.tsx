import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Download,
  History,
  ImagePlus,
  Loader2,
  MessageSquareText,
  Mic,
  RotateCcw,
  Sparkles,
  Square,
  VideoOff,
  X,
} from 'lucide-react';
import { openShareStudio } from './MacroShareModal';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { formatShortDate } from '../utils/dateUtils';
import { round1 } from '../utils/nutritionUtils';
import {
  analyzeMealViaApi,
  fetchRecentMealScansFromSupabase,
  saveMealScanToSupabase,
  uploadMealPhotoToSupabase,
} from '../services/mealAiService';
import {
  AiMealScanRecord,
  AnalyzedMealItem,
  MEAL_CATEGORIES,
  MealAiAnalysisResult,
  MealCategory,
} from '../types';

type ScannerTab = 'photo' | 'voice' | 'text';

interface EditableAnalyzedItem extends AnalyzedMealItem {
  _id: string;
  selected: boolean;
}

interface SpeechRecognitionAlternativeLike {
  transcript?: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function getSpeechRecognitionCtor(): BrowserSpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: BrowserSpeechRecognitionCtor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read media bytes'));
    reader.readAsDataURL(blob);
  });
}

async function compressCanvasToJpeg(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number
): Promise<{
  blob: Blob;
  base64: string;
  mimeType: string;
  previewUrl: string;
}> {
  const maxDim = 640;
  const scale = Math.min(1, maxDim / Math.max(1, srcWidth, srcHeight));
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(source, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Image compression failed'));
      },
      'image/jpeg',
      0.7
    );
  });

  const base64 = await blobToBase64(blob);
  const previewUrl = URL.createObjectURL(blob);
  return { blob, base64, mimeType: 'image/jpeg', previewUrl };
}

async function compressImageFileToJpeg(file: File): Promise<{
  blob: Blob;
  base64: string;
  mimeType: string;
  previewUrl: string;
}> {
  // Fast hardware-downsampled decode for large 12MP-50MP phone photos when supported
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, {
        resizeWidth: 720,
        resizeQuality: 'medium',
      });
      try {
        return await compressCanvasToJpeg(bitmap, bitmap.width, bitmap.height);
      } finally {
        bitmap.close?.();
      }
    } catch {
      // Fallback to standard Image element below
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode selected photo. Try JPEG or PNG format.'));
      el.src = objectUrl;
    });
    return await compressCanvasToJpeg(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const MealAiScannerModal: React.FC = () => {
  const {
    authUser,
    mealScannerModal,
    closeMealScannerModal,
    logAnalyzedMealItems,
    notify,
  } = useMacroLogStore();

  const [mode, setMode] = useState<ScannerTab>('photo');
  const [mealType, setMealType] = useState<MealCategory>('lunch');
  const [logDate, setLogDate] = useState<string>(mealScannerModal.targetDate);

  // Photo state + live camera viewfinder state
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState('');
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [liveCameraActive, setLiveCameraActive] = useState(false);
  const [liveCameraStarting, setLiveCameraStarting] = useState(false);
  const [liveCameraReady, setLiveCameraReady] = useState(false);

  // Voice recording + live SpeechRecognition state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string>('audio/webm');
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceContextNote, setVoiceContextNote] = useState('');

  // Quick text describe state
  const [describeText, setDescribeText] = useState('');

  // Analysis & editable items
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<MealAiAnalysisResult | null>(null);
  const [editableItems, setEditableItems] = useState<EditableAnalyzedItem[]>([]);

  // Recent scans history from Supabase
  const [recentScans, setRecentScans] = useState<AiMealScanRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const speechRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceTranscriptRef = useRef('');
  const timerRef = useRef<number | null>(null);

  const photoVideoRef = useRef<HTMLVideoElement | null>(null);
  const photoStreamRef = useRef<MediaStream | null>(null);
  const isOpenRef = useRef<boolean>(mealScannerModal.isOpen);

  const stopLivePhotoCamera = useCallback(() => {
    if (photoStreamRef.current) {
      photoStreamRef.current.getTracks().forEach((t) => t.stop());
      photoStreamRef.current = null;
    }
    if (photoVideoRef.current) {
      photoVideoRef.current.srcObject = null;
    }
    setLiveCameraActive(false);
    setLiveCameraStarting(false);
    setLiveCameraReady(false);
  }, []);

  const stopRecordingTracks = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (speechRef.current) {
      try {
        speechRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      speechRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    isOpenRef.current = mealScannerModal.isOpen;
    if (!mealScannerModal.isOpen) {
      stopRecordingTracks();
      stopLivePhotoCamera();
      setIsRecording(false);
      return;
    }

    setMode(mealScannerModal.initialMode);
    setMealType(mealScannerModal.initialMeal);
    setLogDate(mealScannerModal.targetDate);
    setError('');
    setAnalysis(null);
    setEditableItems([]);
    setShowHistory(false);

    if (authUser) {
      void fetchRecentMealScansFromSupabase(authUser.id, 6).then(setRecentScans);
    }
  }, [
    authUser,
    mealScannerModal.initialMeal,
    mealScannerModal.initialMode,
    mealScannerModal.isOpen,
    mealScannerModal.targetDate,
    stopLivePhotoCamera,
    stopRecordingTracks,
  ]);

  useEffect(() => {
    return () => {
      stopRecordingTracks();
      stopLivePhotoCamera();
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    };
  }, [audioPreviewUrl, photoPreviewUrl, stopLivePhotoCamera, stopRecordingTracks]);

  // Attach MediaStream only AFTER React commits the <video> mount so first-time permission grant never renders blank
  useEffect(() => {
    if (!liveCameraActive) return;
    const video = photoVideoRef.current;
    const stream = photoStreamRef.current;
    if (!video || !stream) return;

    let cancelled = false;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    const tryPlay = async () => {
      if (cancelled) return;
      try {
        await video.play();
      } catch {
        // Fallback handled by autoPlay + playsInline + muted or event listeners
      }
    };

    const handleReady = () => {
      if (cancelled) return;
      if (video.videoWidth > 0 || video.readyState >= 2) {
        setLiveCameraReady(true);
      }
      void tryPlay();
    };

    video.addEventListener('loadedmetadata', handleReady);
    video.addEventListener('loadeddata', handleReady);
    video.addEventListener('canplay', handleReady);
    video.addEventListener('playing', handleReady);

    if (video.readyState >= 2) {
      setLiveCameraReady(true);
    }
    void tryPlay();

    return () => {
      cancelled = true;
      video.removeEventListener('loadedmetadata', handleReady);
      video.removeEventListener('loadeddata', handleReady);
      video.removeEventListener('canplay', handleReady);
      video.removeEventListener('playing', handleReady);
    };
  }, [liveCameraActive]);

  const selectedItems = useMemo(
    () => editableItems.filter((item) => item.selected),
    [editableItems]
  );

  const selectedTotals = useMemo(() => {
    return selectedItems.reduce(
      (acc, item) => ({
        calories: acc.calories + Math.round(item.calories || 0),
        protein: Math.round((acc.protein + (item.protein || 0)) * 10) / 10,
        carbs: Math.round((acc.carbs + (item.carbs || 0)) * 10) / 10,
        fat: Math.round((acc.fat + (item.fat || 0)) * 10) / 10,
        fibre: Math.round((acc.fibre + (item.fibre || 0)) * 10) / 10,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }
    );
  }, [selectedItems]);

  if (!mealScannerModal.isOpen) return null;

  const handlePhotoChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    stopLivePhotoCamera();
    setError('');
    setAnalysis(null);
    setEditableItems([]);
    setPreparingPhoto(true);

    try {
      const compressed = await compressImageFileToJpeg(file);
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPreviewUrl(compressed.previewUrl);
      setPhotoBlob(compressed.blob);
      setPhotoBase64(compressed.base64);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load meal photo.');
    } finally {
      setPreparingPhoto(false);
    }
  };

  const startInAppCamera = async () => {
    setError('');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('In-app camera is unavailable in this browser. Use Choose Photo below instead.');
      return;
    }

    stopLivePhotoCamera();
    setLiveCameraStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (!isOpenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      photoStreamRef.current = stream;
      setLiveCameraReady(false);
      setLiveCameraActive(true);
      setLiveCameraStarting(false);
    } catch {
      setLiveCameraStarting(false);
      setLiveCameraActive(false);
      setLiveCameraReady(false);
      setError('Camera permission denied or unavailable. Use Choose Photo to pick or snap an image.');
    }
  };

  const captureFromLiveCamera = async () => {
    const video = photoVideoRef.current;
    if (!video || video.readyState < 2) return;
    setPreparingPhoto(true);
    setError('');
    try {
      const compressed = await compressCanvasToJpeg(
        video,
        video.videoWidth || 640,
        video.videoHeight || 480
      );
      stopLivePhotoCamera();
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPreviewUrl(compressed.previewUrl);
      setPhotoBlob(compressed.blob);
      setPhotoBase64(compressed.base64);
    } catch {
      setError('Could not capture frame from camera. Try Choose Photo instead.');
    } finally {
      setPreparingPhoto(false);
    }
  };

  const startVoiceRecording = async () => {
    setError('');
    setAnalysis(null);
    setEditableItems([]);
    setAudioBase64(null);
    setAudioPreviewUrl(null);
    setVoiceTranscript('');
    voiceTranscriptRef.current = '';

    const SpeechCtor = getSpeechRecognitionCtor();
    const hasMediaRecorder =
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== 'undefined';

    if (!SpeechCtor && !hasMediaRecorder) {
      setError(
        'Voice recording is not supported in this browser. Switch to Describe Meal to type what you ate.'
      );
      return;
    }

    // Start live speech recognition in parallel for near-instant spoken sentence capture
    if (SpeechCtor) {
      try {
        const recognition = new SpeechCtor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || 'en-IN';
        let finalText = '';

        recognition.onresult = (ev) => {
          let interimText = '';
          for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
            const seg = ev.results[i]?.[0]?.transcript || '';
            if (ev.results[i]?.isFinal) {
              finalText += `${seg} `;
            } else {
              interimText += seg;
            }
          }
          const combined = `${finalText}${interimText}`.trim();
          if (combined) {
            voiceTranscriptRef.current = combined;
            setVoiceTranscript(combined);
          }
        };
        recognition.onerror = () => {
          // Keep MediaRecorder running cleanly as audio fallback
        };
        recognition.start();
        speechRef.current = recognition;
      } catch {
        speechRef.current = null;
      }
    }

    if (!hasMediaRecorder) {
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const chosenMime = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        try {
          const mime = recorder.mimeType || chosenMime || 'audio/webm';
          const blob = new Blob(audioChunksRef.current, { type: mime });
          if (blob.size >= 300) {
            const base64 = await blobToBase64(blob);
            if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
            setAudioBase64(base64);
            setAudioMimeType(mime.split(';')[0] || 'audio/webm');
            setAudioPreviewUrl(URL.createObjectURL(blob));
          } else if (!voiceTranscriptRef.current.trim()) {
            setError('Recording was too short. Hold and speak clearly for at least 1–2 seconds.');
          }
        } catch {
          if (!voiceTranscriptRef.current.trim()) {
            setError('Could not process audio clip. Please try again or type your meal.');
          }
        } finally {
          stopRecordingTracks();
          setIsRecording(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 59) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
              mediaRecorderRef.current.stop();
            }
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      stopRecordingTracks();
      setIsRecording(false);
      setError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow mic access in browser settings or use Photo Scan / Describe Meal.'
          : 'Could not start microphone recording. You can type your meal under Describe Meal.'
      );
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      stopRecordingTracks();
      setIsRecording(false);
    }
  };

  const applyAnalysisResult = (result: MealAiAnalysisResult) => {
    setAnalysis(result);
    if (result.suggestedMealType) {
      setMealType(result.suggestedMealType);
    }
    setEditableItems(
      (result.items || []).map((item, idx) => ({
        ...item,
        _id: `ai-item-${Date.now()}-${idx}`,
        selected: true,
      }))
    );
  };

  const handleAnalyze = async () => {
    setError('');
    setAnalyzing(true);
    try {
      let res: MealAiAnalysisResult;
      if (mode === 'photo') {
        if (!photoBase64) {
          setError('Capture or choose a food photo first.');
          return;
        }
        res = await analyzeMealViaApi({
          mode: 'photo',
          mimeType: 'image/jpeg',
          mediaBase64: photoBase64,
          promptText: photoNote.trim() || undefined,
          mealHint: mealType,
        });
      } else if (mode === 'voice') {
        const spokenText = voiceTranscript.trim();
        if (spokenText.length >= 3) {
          // Fast path: analyze the recognized spoken sentence directly (~1-2s)
          const combinedNote = voiceContextNote.trim()
            ? `${spokenText}. Extra context: ${voiceContextNote.trim()}`
            : spokenText;
          res = await analyzeMealViaApi({
            mode: 'text',
            promptText: combinedNote,
            mealHint: mealType,
          });
        } else if (audioBase64) {
          res = await analyzeMealViaApi({
            mode: 'voice',
            mimeType: audioMimeType,
            mediaBase64: audioBase64,
            promptText: voiceContextNote.trim() || undefined,
            mealHint: mealType,
          });
        } else {
          setError('Record a short voice clip or type the meal you ate first.');
          return;
        }
      } else {
        if (describeText.trim().length < 3) {
          setError('Describe what you ate (for example: "2 chapatis, 1 bowl dal, 100g paneer").');
          return;
        }
        res = await analyzeMealViaApi({
          mode: 'text',
          promptText: describeText.trim(),
          mealHint: mealType,
        });
      }

      if (!res.items || res.items.length === 0) {
        setError('No recognizable food items were detected. Try adding a clearer note or photo.');
        return;
      }

      applyAnalysisResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Meal analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const updateItemField = (
    id: string,
    field: keyof EditableAnalyzedItem,
    value: string | number | boolean
  ) => {
    setEditableItems((prev) =>
      prev.map((item) => {
        if (item._id !== id) return item;
        return { ...item, [field]: value };
      })
    );
  };

  const handleSaveToDiary = async () => {
    if (selectedItems.length === 0) {
      setError('Select at least one detected item to add to your diary.');
      return;
    }

    setSaving(true);
    try {
      const sourceLabel =
        mode === 'photo'
          ? 'AI Photo Scan'
          : mode === 'voice'
          ? 'AI Voice Log'
          : 'AI Meal Describe';

      logAnalyzedMealItems({
        items: selectedItems,
        mealType,
        date: logDate,
        sourceLabel,
      });

      if (authUser && analysis) {
        let storagePath: string | null = null;
        if (mode === 'photo' && photoBlob) {
          storagePath = await uploadMealPhotoToSupabase({
            userId: authUser.id,
            blob: photoBlob,
          });
        }

        const savedScan = await saveMealScanToSupabase({
          userId: authUser.id,
          inputMode: mode,
          mealType,
          mealTitle: analysis.mealTitle,
          transcriptOrNotes:
            analysis.detectedDescription ||
            (mode === 'text'
              ? describeText
              : mode === 'voice'
              ? voiceTranscript || voiceContextNote
              : photoNote) ||
            undefined,
          detectedItems: selectedItems,
          totalCalories: selectedTotals.calories,
          totalProtein: selectedTotals.protein,
          totalCarbs: selectedTotals.carbs,
          totalFat: selectedTotals.fat,
          totalFibre: selectedTotals.fibre,
          confidence: analysis.confidence,
          nutritionTip: analysis.nutritionTip,
          imageStoragePath: storagePath,
          loggedToDiary: true,
        });
        if (savedScan) {
          setRecentScans((prev) => [savedScan, ...prev].slice(0, 6));
        }
      }

      closeMealScannerModal();
    } finally {
      setSaving(false);
    }
  };

  const handleQuickRelogScan = (scan: AiMealScanRecord) => {
    if (!scan.detectedItems || scan.detectedItems.length === 0) {
      notify('No food items stored in that scan record.', 'error');
      return;
    }
    logAnalyzedMealItems({
      items: scan.detectedItems,
      mealType: scan.mealType || mealType,
      date: logDate,
      sourceLabel: `AI ${scan.inputMode === 'voice' ? 'Voice' : scan.inputMode === 'photo' ? 'Photo' : 'Text'} Re-log`,
    });
    closeMealScannerModal();
  };

  const resetInputs = () => {
    stopLivePhotoCamera();
    setAnalysis(null);
    setEditableItems([]);
    setError('');
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setPhotoPreviewUrl(null);
    setPhotoBlob(null);
    setPhotoBase64(null);
    setAudioBase64(null);
    setAudioPreviewUrl(null);
    setVoiceTranscript('');
    voiceTranscriptRef.current = '';
  };

  const canAnalyze =
    !analyzing &&
    !preparingPhoto &&
    !isRecording &&
    ((mode === 'photo' && Boolean(photoBase64)) ||
      (mode === 'voice' && (Boolean(audioBase64) || voiceTranscript.trim().length >= 3)) ||
      (mode === 'text' && describeText.trim().length >= 3));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="AI Photo and Voice Meal Analyzer"
    >
      <div className="w-full sm:max-w-2xl max-h-[92dvh] flex flex-col bg-white dark:bg-[#111317] rounded-t-3xl sm:rounded-2xl border border-black/10 dark:border-white/12 shadow-2xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-stone-300 dark:bg-slate-700 rounded-full mx-auto mt-3 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-black/10 dark:border-white/12 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-lime-100 dark:bg-lime-950/60 text-lime-700 dark:text-lime-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-50 truncate">
                AI Photo &amp; Voice Meal Logger
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Snap a plate photo, speak what you ate, or type a meal description
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {recentScans.length > 0 && (
              <button
                type="button"
                onClick={() => setShowHistory((s) => !s)}
                className={`min-h-[36px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 ${
                  showHistory
                    ? 'border-lime-500 bg-lime-50 dark:bg-lime-950/40 text-lime-800 dark:text-lime-300'
                    : 'border-black/10 dark:border-white/15 text-slate-600 dark:text-slate-300'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>History ({recentScans.length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={closeMealScannerModal}
              aria-label="Close meal analyzer"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-stone-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="px-5 pt-3.5 pb-2 border-b border-stone-100 dark:border-white/10 shrink-0">
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-stone-100 dark:bg-[#090A0C]">
            {(
              [
                { id: 'photo', label: 'Photo Scan', icon: Camera },
                { id: 'voice', label: 'Voice Log', icon: Mic },
                { id: 'text', label: 'Describe Meal', icon: MessageSquareText },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    stopLivePhotoCamera();
                    setMode(tab.id);
                    setError('');
                    setShowHistory(false);
                  }}
                  className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-700 dark:text-red-300 leading-relaxed">
              {error}
            </div>
          )}

          {/* Optional Recent Scans Drawer */}
          {showHistory && recentScans.length > 0 && (
            <div className="rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/70 dark:bg-[#090A0C]/60 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Recent Saved Scans (Supabase)
                </span>
                <span className="text-[11px] text-slate-400">One-tap re-log</span>
              </div>
              <div className="space-y-2">
                {recentScans.map((scan) => (
                  <div
                    key={scan.id}
                    className="p-3 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {scan.mealTitle}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                        {scan.totalCalories} kcal · P {scan.totalProtein}g · C {scan.totalCarbs}g · F{' '}
                        {scan.totalFat}g
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleQuickRelogScan(scan)}
                      className="min-h-[34px] px-3 rounded-lg bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-semibold whitespace-nowrap shrink-0"
                    >
                      Re-log
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mode Input Controls */}
          {!analysis && (
            <div className="space-y-4">
              {mode === 'photo' && (
                <div className="space-y-3.5">
                  {liveCameraActive ? (
                    <div className="rounded-2xl overflow-hidden border border-black/10 dark:border-white/12 bg-black relative">
                      <video
                        ref={photoVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-64 object-cover bg-black"
                      />
                      {!liveCameraReady && (
                        <div className="absolute inset-x-0 top-0 h-64 flex flex-col items-center justify-center gap-2 bg-black/70 text-white text-xs pointer-events-none">
                          <Loader2 className="w-5 h-5 animate-spin text-[#C8FF00]" />
                          <span>Starting camera preview...</span>
                        </div>
                      )}
                      <div className="p-3 bg-white dark:bg-[#111317] border-t border-black/10 dark:border-white/12 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={stopLivePhotoCamera}
                          className="min-h-[40px] px-3.5 rounded-xl border border-black/10 dark:border-white/15 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
                        >
                          <VideoOff className="w-3.5 h-3.5" />
                          Close Camera
                        </button>
                        <button
                          type="button"
                          onClick={() => void captureFromLiveCamera()}
                          className="min-h-[40px] px-4 rounded-xl bg-lime-500 hover:bg-lime-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <Camera className="w-4 h-4" />
                          Capture Meal Photo
                        </button>
                      </div>
                    </div>
                  ) : photoPreviewUrl ? (
                    <div className="rounded-2xl overflow-hidden border border-black/10 dark:border-white/12 bg-stone-100 dark:bg-[#090A0C]">
                      <img
                        src={photoPreviewUrl}
                        alt="Captured meal preview"
                        className="w-full max-h-64 object-cover"
                      />
                      <div className="px-4 py-2.5 flex items-center justify-between bg-white dark:bg-[#111317] border-t border-black/10 dark:border-white/12">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Ready for AI portion &amp; macro breakdown
                        </span>
                        <button
                          type="button"
                          onClick={resetInputs}
                          className="text-xs font-semibold text-lime-700 dark:text-lime-400 hover:underline inline-flex items-center gap-1"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Retake
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-stone-300 dark:border-white/15 bg-stone-50/70 dark:bg-[#090A0C]/50 p-6 text-center space-y-4">
                      <div className="w-12 h-12 rounded-2xl bg-lime-100 dark:bg-lime-950/60 text-lime-700 dark:text-lime-400 flex items-center justify-center mx-auto">
                        {preparingPhoto ? (
                          <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                          <Camera className="w-6 h-6" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {preparingPhoto
                            ? 'Optimizing photo for fast analysis...'
                            : 'Capture or Upload Your Meal Photo'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Works with Indian thalis, home-cooked bowls, packaged snacks, and restaurant plates.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => void startInAppCamera()}
                          disabled={liveCameraStarting || preparingPhoto}
                          className="min-h-[42px] px-4 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-50"
                        >
                          {liveCameraStarting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Camera className="w-4 h-4" />
                          )}
                          Live Camera
                        </button>

                        <label className="min-h-[42px] px-4 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-lime-500 inline-flex items-center gap-2 cursor-pointer">
                          <ImagePlus className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                          <span>Choose / Snap Photo</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoChosen}
                            className="sr-only"
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                      Optional Portion Context (improves accuracy)
                    </label>
                    <input
                      type="text"
                      value={photoNote}
                      onChange={(e) => setPhotoNote(e.target.value)}
                      placeholder="e.g., 2 whole wheat rotis with ghee, 150g paneer curry"
                      className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                    />
                  </div>
                </div>
              )}

              {mode === 'voice' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-black/10 dark:border-white/12 bg-stone-50/70 dark:bg-[#090A0C]/50 p-6 text-center space-y-4">
                    <div
                      className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center transition-colors ${
                        isRecording
                          ? 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 animate-pulse'
                          : 'bg-lime-100 dark:bg-lime-950/60 text-lime-700 dark:text-lime-400'
                      }`}
                    >
                      <Mic className="w-6 h-6" />
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {isRecording
                          ? `Listening... ${recordingSeconds}s`
                          : voiceTranscript || audioPreviewUrl
                          ? 'Voice Note Ready'
                          : 'Speak What You Ate'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                        Example: &ldquo;For lunch I had 1 cup rice, 1 bowl dal, and 120g grilled chicken.&rdquo;
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      {!isRecording ? (
                        <button
                          type="button"
                          onClick={() => void startVoiceRecording()}
                          className="min-h-[44px] px-5 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-semibold inline-flex items-center gap-2"
                        >
                          <Mic className="w-4 h-4" />
                          {audioPreviewUrl || voiceTranscript ? 'Record Again' : 'Start Recording'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={stopVoiceRecording}
                          className="min-h-[44px] px-5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold inline-flex items-center gap-2"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                          Stop Recording
                        </button>
                      )}
                    </div>

                    {audioPreviewUrl && !isRecording && (
                      <div className="pt-2 max-w-sm mx-auto">
                        <audio src={audioPreviewUrl} controls className="w-full h-9" />
                      </div>
                    )}
                  </div>

                  {/* Live / Editable Spoken Sentence Box */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                      Spoken Meal Sentence {voiceTranscript ? '(you can tweak if needed)' : '(appears as you speak, or type here)'}
                    </label>
                    <textarea
                      rows={2}
                      value={voiceTranscript}
                      onChange={(e) => {
                        voiceTranscriptRef.current = e.target.value;
                        setVoiceTranscript(e.target.value);
                      }}
                      placeholder="Your spoken sentence appears here automatically..."
                      className="w-full p-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                      Optional Extra Note (brand, oil, or serving tweak)
                    </label>
                    <input
                      type="text"
                      value={voiceContextNote}
                      onChange={(e) => setVoiceContextNote(e.target.value)}
                      placeholder="e.g., Cooked with 1 tsp olive oil"
                      className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                    />
                  </div>
                </div>
              )}

              {mode === 'text' && (
                <div className="space-y-3">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Describe Your Meal in Plain Language
                  </label>
                  <textarea
                    rows={4}
                    value={describeText}
                    onChange={(e) => setDescribeText(e.target.value)}
                    placeholder="e.g., 2 masala dosas with 1 bowl sambar, 2 tbsp coconut chutney, and 1 cup filter coffee with low-fat milk"
                    className="w-full p-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                  />
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={!canAnalyze}
                  onClick={() => void handleAnalyze()}
                  className="w-full sm:w-auto min-h-[46px] px-6 rounded-xl bg-lime-500 hover:bg-lime-400 text-slate-950 text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Analyzing Meal Macros...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Analyze Nutrition</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Analyzed Results & Editable Review */}
          {analysis && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-lime-500/40 bg-lime-50/60 dark:bg-lime-950/20 p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-lime-800 dark:text-lime-300">
                      Detected Meal · Confidence: {analysis.confidence}
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
                      {analysis.mealTitle}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={resetInputs}
                    className="min-h-[34px] px-3 rounded-lg border border-stone-300 dark:border-white/15 bg-white dark:bg-[#111317] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    New Scan
                  </button>
                </div>
                {analysis.detectedDescription && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {analysis.detectedDescription}
                  </p>
                )}
                {analysis.nutritionTip && (
                  <p className="text-xs text-lime-800 dark:text-lime-300 font-medium">
                    Tip: {analysis.nutritionTip}
                  </p>
                )}
              </div>

              {/* Live Totals of Selected Items */}
              <div className="grid grid-cols-5 gap-2 text-center font-mono-nums">
                {[
                  { label: 'Calories', val: `${selectedTotals.calories}` },
                  { label: 'Protein', val: `${selectedTotals.protein}g` },
                  { label: 'Carbs', val: `${selectedTotals.carbs}g` },
                  { label: 'Fat', val: `${selectedTotals.fat}g` },
                  { label: 'Fibre', val: `${selectedTotals.fibre}g` },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="p-2.5 rounded-xl bg-stone-50 dark:bg-[#090A0C] border border-black/10 dark:border-white/12"
                  >
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{stat.label}</div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-50 mt-0.5">
                      {stat.val}
                    </div>
                  </div>
                ))}
              </div>

              {/* Editable Item Rows */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Review &amp; Adjust Detected Foods ({selectedItems.length} of {editableItems.length} selected)
                </div>

                {editableItems.map((item) => (
                  <div
                    key={item._id}
                    className={`p-3.5 rounded-xl border transition-colors space-y-2.5 ${
                      item.selected
                        ? 'border-black/10 dark:border-white/12 bg-stone-50/50 dark:bg-[#090A0C]/50'
                        : 'border-black/10/50 dark:border-white/12/40 opacity-55'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(e) => updateItemField(item._id, 'selected', e.target.checked)}
                        className="w-4 h-4 accent-lime-500 shrink-0"
                      />
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateItemField(item._id, 'name', e.target.value)}
                        className="flex-1 h-9 px-2.5 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-xs font-semibold text-slate-900 dark:text-slate-100"
                      />
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                        {item.estimatedQuantityDescription}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-[11px]">
                      <div>
                        <label className="text-slate-400 block mb-0.5">Grams</label>
                        <input
                          type="number"
                          min="1"
                          value={item.estimatedGrams}
                          onChange={(e) =>
                            updateItemField(item._id, 'estimatedGrams', Number(e.target.value) || 0)
                          }
                          className="w-full h-8 px-2 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] font-mono-nums"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-0.5">kcal</label>
                        <input
                          type="number"
                          min="0"
                          value={item.calories}
                          onChange={(e) =>
                            updateItemField(item._id, 'calories', Number(e.target.value) || 0)
                          }
                          className="w-full h-8 px-2 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] font-mono-nums"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-0.5">Protein (g)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={item.protein}
                          onChange={(e) =>
                            updateItemField(item._id, 'protein', Number(e.target.value) || 0)
                          }
                          className="w-full h-8 px-2 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] font-mono-nums"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-0.5">Carbs (g)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={item.carbs}
                          onChange={(e) =>
                            updateItemField(item._id, 'carbs', Number(e.target.value) || 0)
                          }
                          className="w-full h-8 px-2 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] font-mono-nums"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-0.5">Fat (g)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={item.fat}
                          onChange={(e) =>
                            updateItemField(item._id, 'fat', Number(e.target.value) || 0)
                          }
                          className="w-full h-8 px-2 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] font-mono-nums"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-0.5">Fibre (g)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={item.fibre}
                          onChange={(e) =>
                            updateItemField(item._id, 'fibre', Number(e.target.value) || 0)
                          }
                          className="w-full h-8 px-2 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] font-mono-nums"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Meal & Date Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Meal Category
                  </label>
                  <select
                    value={mealType}
                    onChange={(e) => setMealType(e.target.value as MealCategory)}
                    className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-xs font-semibold text-slate-900 dark:text-slate-100"
                  >
                    {MEAL_CATEGORIES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Log Date
                  </label>
                  <input
                    type="date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                {mode === 'photo' && (
                  <button
                    type="button"
                    disabled={selectedItems.length === 0}
                    onClick={() =>
                      openShareStudio({
                        mode: 'food',
                        foodPayload: {
                          title: analysis.mealTitle || 'AI Photo Scan Meal',
                          subtitle: `${selectedItems.length} ${
                            selectedItems.length === 1 ? 'item' : 'items'
                          } · AI Photo Scan`,
                          calories: Math.round(selectedTotals.calories),
                          protein: round1(selectedTotals.protein),
                          carbs: round1(selectedTotals.carbs),
                          fat: round1(selectedTotals.fat),
                          fibre: round1(selectedTotals.fibre),
                          dateLabel: formatShortDate(logDate),
                        },
                      })
                    }
                    className="sm:w-auto min-h-[48px] px-4 rounded-xl border border-black/15 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 hover:border-[#C8FF00] transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
                  >
                    <Download className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
                    <span>Download Full Macros PNG</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={saving || selectedItems.length === 0}
                  onClick={() => void handleSaveToDiary()}
                  className="flex-1 min-h-[48px] rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving to Food Diary...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Add {selectedItems.length} Selected Items to Food Log</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
