import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  Share2,
  X,
} from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { formatShortDate, getTodayDateKey } from '../utils/dateUtils';
import { round1 } from '../utils/nutritionUtils';
import {
  FoodStickerTemplateId,
  OVERLAY_COLOR_PRESETS,
  OverlayTransform,
  renderOverlayToAssets,
  renderOverlayToAssetsSync,
  renderShareOverlayToCanvas,
  RenderOverlayParams,
  ShareFoodPayload,
  triggerBlobDownload,
} from '../utils/shareOverlayRenderer';

export interface OpenShareStudioDetail {
  mode?: 'food';
  foodPayload?: ShareFoodPayload;
}

export function openShareStudio(detail: OpenShareStudioDetail = {}): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('calothrix:open-share', { detail }));
  }
}

const DEFAULT_TRANSFORM: OverlayTransform = {
  posX: 0,
  posY: 0,
  scale: 1,
  rotationDeg: 0,
  opacity: 0.98,
  textColor: '#FFFFFF',
  accentColor: '#C8FF00',
  showBranding: true,
  showDate: true,
};

const FOOD_STICKER_TEMPLATES: {
  id: FoodStickerTemplateId;
  label: string;
}[] = [
  { id: 'circle-row', label: '4 Circles Row' },
  { id: 'single-line', label: 'Straight Bar' },
  { id: 'classic-circles', label: '2×2 Macro Rings' },
  { id: 'vertical-rail', label: 'Side Rail' },
];

const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundColor: '#363941',
  backgroundImage:
    'linear-gradient(45deg, #494D57 25%, transparent 25%), linear-gradient(-45deg, #494D57 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #494D57 75%), linear-gradient(-45deg, transparent 75%, #494D57 75%)',
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
};

type DevicePlatform = 'ios' | 'android' | 'desktop';

function detectDevicePlatform(): DevicePlatform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua))
  ) {
    return 'ios';
  }
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

interface CachedStickerAssets {
  key: string;
  blob: Blob;
  dataUrl: string;
  file: File;
  filename: string;
}

interface FoodStickerPreviewTileProps {
  templateId: FoodStickerTemplateId;
  label: string;
  selected: boolean;
  food: ShareFoodPayload;
  transform: OverlayTransform;
  onSelect: () => void;
}

const FoodStickerPreviewTile: React.FC<FoodStickerPreviewTileProps> = ({
  templateId,
  label,
  selected,
  food,
  transform,
  onSelect,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    renderShareOverlayToCanvas(canvasRef.current, {
      mode: 'food',
      foodTemplate: templateId,
      macroTemplate: 'classic-circles',
      streakTemplate: 'streak-ring',
      journeyTemplate: 'journey-editorial',
      transform: {
        ...DEFAULT_TRANSFORM,
        textColor: transform.textColor,
        accentColor: transform.accentColor,
      },
      food,
      macros: {
        calories: food.calories,
        calorieGoal: 0,
        protein: food.protein,
        proteinGoal: 0,
        carbs: food.carbs,
        carbsGoal: 0,
        fat: food.fat,
        fatGoal: 0,
        dateLabel: food.dateLabel,
      },
      streak: {
        currentStreak: 0,
        longestStreak: 0,
        headline: '',
        milestoneLabel: '',
        weeklyConsistencyPct: 0,
        dateLabel: food.dateLabel,
      },
      journey: {
        title: '',
        startingWeightLabel: '',
        currentWeightLabel: '',
        deltaLabel: '',
        daysTracked: 0,
        avgProteinLabel: '',
        proteinConsistencyPct: 0,
        directionLabel: '',
        dateLabel: food.dateLabel,
      },
      transparentOnly: true,
    });
  }, [food, templateId, transform.accentColor, transform.textColor]);

  return (
    <button
      type="button"
      onClick={onSelect}
      style={CHECKERBOARD_STYLE}
      aria-pressed={selected}
      aria-label={`Select ${label} transparent sticker`}
      className={`group relative h-[138px] sm:h-[172px] w-full rounded-2xl overflow-hidden flex flex-col justify-between transition-all text-left border-2 cursor-pointer ${
        selected
          ? 'border-[#111317] dark:border-[#C8FF00] ring-2 ring-[#C8FF00]/40 scale-[0.99]'
          : 'border-black/15 dark:border-white/15 hover:border-black/35 dark:hover:border-white/35'
      }`}
    >
      <div
        className={`absolute top-2 right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
          selected
            ? 'bg-[#C8FF00] text-[#090A0C]'
            : 'bg-[#090A0C]/60 text-white/60 border border-white/30'
        }`}
      >
        <Check className="w-3 h-3 stroke-[2.75]" />
      </div>

      <div className="flex-1 min-h-0 w-full p-2.5 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full w-auto h-auto object-contain pointer-events-none block"
        />
      </div>

      <div className="w-full px-2.5 py-1.5 bg-[#090A0C]/80 backdrop-blur-xs flex items-center justify-between gap-2 shrink-0">
        <span className="text-[11px] sm:text-xs font-semibold text-white truncate">{label}</span>
        <span className="text-[10px] font-mono text-[#C8FF00] uppercase shrink-0">PNG</span>
      </div>
    </button>
  );
};

export const MacroShareModal: React.FC = () => {
  const { selectedDate, selectedDateTotals, notify } = useMacroLogStore();

  const [isOpen, setIsOpen] = useState(false);
  const [foodPayload, setFoodPayload] = useState<ShareFoodPayload | null>(null);
  const [foodTemplate, setFoodTemplate] = useState<FoodStickerTemplateId>('circle-row');
  const [transform, setTransform] = useState<OverlayTransform>(DEFAULT_TRANSFORM);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [feedbackState, setFeedbackState] = useState<'idle' | 'copied' | 'saved'>('idle');
  const [photoSavePreview, setPhotoSavePreview] = useState<{
    dataUrl: string;
    blob: Blob;
    filename: string;
  } | null>(null);

  const cachedAssetsRef = useRef<CachedStickerAssets | null>(null);
  const todayKey = getTodayDateKey();
  const platform = useMemo(() => detectDevicePlatform(), []);
  const isMobile = platform !== 'desktop';

  useEffect(() => {
    const handler = (ev: Event) => {
      const custom = ev as CustomEvent<OpenShareStudioDetail>;
      const detail = custom.detail || {};
      setFoodPayload(detail.foodPayload || null);
      setTransform(DEFAULT_TRANSFORM);
      setPhotoSavePreview(null);
      setFeedbackState('idle');
      setIsOpen(true);
    };
    window.addEventListener('calothrix:open-share', handler);
    return () => window.removeEventListener('calothrix:open-share', handler);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPhotoSavePreview(null);
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const markFeedback = useCallback((kind: 'copied' | 'saved') => {
    setFeedbackState(kind);
    window.setTimeout(() => {
      setFeedbackState((prev) => (prev === kind ? 'idle' : prev));
    }, 2000);
  }, []);

  const effectiveFoodPayload: ShareFoodPayload = useMemo(() => {
    if (foodPayload) return foodPayload;
    return {
      title: 'Logged Meal',
      calories: Math.round(selectedDateTotals.calories),
      protein: round1(selectedDateTotals.protein),
      carbs: round1(selectedDateTotals.carbs),
      fat: round1(selectedDateTotals.fat),
      fibre: round1(selectedDateTotals.fibre),
      dateLabel: formatShortDate(selectedDate),
    };
  }, [foodPayload, selectedDate, selectedDateTotals]);

  const buildOverlayParams = useCallback(
    (): RenderOverlayParams => ({
      mode: 'food',
      foodTemplate,
      macroTemplate: 'classic-circles',
      streakTemplate: 'streak-ring',
      journeyTemplate: 'journey-editorial',
      transform,
      food: effectiveFoodPayload,
      macros: {
        calories: effectiveFoodPayload.calories,
        calorieGoal: 0,
        protein: effectiveFoodPayload.protein,
        proteinGoal: 0,
        carbs: effectiveFoodPayload.carbs,
        carbsGoal: 0,
        fat: effectiveFoodPayload.fat,
        fatGoal: 0,
        dateLabel: effectiveFoodPayload.dateLabel,
      },
      streak: {
        currentStreak: 0,
        longestStreak: 0,
        headline: '',
        milestoneLabel: '',
        weeklyConsistencyPct: 0,
        dateLabel: effectiveFoodPayload.dateLabel,
      },
      journey: {
        title: '',
        startingWeightLabel: '',
        currentWeightLabel: '',
        deltaLabel: '',
        daysTracked: 0,
        avgProteinLabel: '',
        proteinConsistencyPct: 0,
        directionLabel: '',
        dateLabel: effectiveFoodPayload.dateLabel,
      },
      transparentOnly: true,
    }),
    [effectiveFoodPayload, foodTemplate, transform]
  );

  const buildFilename = useCallback(() => {
    const dateSlug = selectedDate || todayKey;
    const slugTitle =
      effectiveFoodPayload.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'macros';
    return `calothrix-${slugTitle}-${foodTemplate}-${dateSlug}.png`;
  }, [effectiveFoodPayload.title, foodTemplate, selectedDate, todayKey]);

  const currentAssetKey = useMemo(
    () =>
      JSON.stringify({
        foodTemplate,
        textColor: transform.textColor,
        accentColor: transform.accentColor,
        cal: effectiveFoodPayload.calories,
        pro: effectiveFoodPayload.protein,
        carb: effectiveFoodPayload.carbs,
        fat: effectiveFoodPayload.fat,
        title: effectiveFoodPayload.title,
      }),
    [effectiveFoodPayload, foodTemplate, transform.accentColor, transform.textColor]
  );

  // Pre-render the selected sticker while open so mobile navigator.share()
  // can fire synchronously inside the tap gesture without losing activation.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const { blob, dataUrl } = await renderOverlayToAssets(buildOverlayParams(), 'image/png');
        if (cancelled) return;
        const filename = buildFilename();
        const file = new File([blob], filename, { type: 'image/png' });
        cachedAssetsRef.current = {
          key: currentAssetKey,
          blob,
          dataUrl,
          file,
          filename,
        };
      } catch {
        // Rendered on demand if pre-render fails
      }
    }, 40);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [buildFilename, buildOverlayParams, currentAssetKey, isOpen]);

  const getOrRenderAssetsSync = useCallback((): CachedStickerAssets => {
    if (cachedAssetsRef.current && cachedAssetsRef.current.key === currentAssetKey) {
      return cachedAssetsRef.current;
    }
    const { blob, dataUrl } = renderOverlayToAssetsSync(buildOverlayParams(), 'image/png');
    const filename = buildFilename();
    const file = new File([blob], filename, { type: 'image/png' });
    const assets: CachedStickerAssets = {
      key: currentAssetKey,
      blob,
      dataUrl,
      file,
      filename,
    };
    cachedAssetsRef.current = assets;
    return assets;
  }, [buildFilename, buildOverlayParams, currentAssetKey]);

  const getOrRenderAssets = async (): Promise<CachedStickerAssets> => {
    if (cachedAssetsRef.current && cachedAssetsRef.current.key === currentAssetKey) {
      return cachedAssetsRef.current;
    }
    const { blob, dataUrl } = await renderOverlayToAssets(buildOverlayParams(), 'image/png');
    const filename = buildFilename();
    const file = new File([blob], filename, { type: 'image/png' });
    const assets: CachedStickerAssets = {
      key: currentAssetKey,
      blob,
      dataUrl,
      file,
      filename,
    };
    cachedAssetsRef.current = assets;
    return assets;
  };

  const handleExport = async (kind: 'save' | 'share' | 'copy' | 'force-file') => {
    // Synchronously prepare PNG File inside the click gesture so iOS/Android navigator.share()
    // never loses user activation across an async await.
    let syncAssets: CachedStickerAssets | null = null;
    try {
      syncAssets = getOrRenderAssetsSync();
    } catch {
      syncAssets = null;
    }

    const canNativeShareFile =
      Boolean(syncAssets) &&
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [syncAssets!.file] });

    // On iOS, invoking native Share Sheet with pure image files lets "Save Image" store directly in Photos.
    if (syncAssets && canNativeShareFile && (kind === 'share' || (kind === 'save' && platform === 'ios'))) {
      const sharePayload: ShareData =
        kind === 'save'
          ? { files: [syncAssets.file] }
          : { files: [syncAssets.file], title: `${effectiveFoodPayload.title} · CALOTHRIX` };

      setIsExporting(true);
      try {
        await navigator.share(sharePayload);
        markFeedback('saved');
        notify(
          kind === 'save'
            ? 'Tap "Save Image" in the iOS menu to store directly in Photos.'
            : 'Shared transparent sticker!'
        );
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (platform === 'ios') {
          setPhotoSavePreview({
            dataUrl: syncAssets.dataUrl,
            blob: syncAssets.blob,
            filename: syncAssets.filename,
          });
          return;
        }
      } finally {
        setIsExporting(false);
      }
    }

    setIsExporting(true);
    try {
      const assets = syncAssets ?? (await getOrRenderAssets());

      if (kind === 'force-file') {
        triggerBlobDownload(assets.blob, assets.filename);
        markFeedback('saved');
        notify(
          platform === 'android'
            ? 'Saved to Gallery / Downloads! Ready for Instagram Stories.'
            : 'PNG saved to Files.'
        );
        return;
      }

      if (kind === 'copy') {
        if (
          typeof navigator !== 'undefined' &&
          navigator.clipboard &&
          typeof ClipboardItem !== 'undefined'
        ) {
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': assets.blob })]);
            markFeedback('copied');
            notify('Sticker copied! Paste directly onto your Instagram Story photo.');
            return;
          } catch {
            // Fall through on mobile WebView clipboard restrictions
          }
        }
        if (isMobile) {
          setPhotoSavePreview({
            dataUrl: assets.dataUrl,
            blob: assets.blob,
            filename: assets.filename,
          });
          return;
        }
        triggerBlobDownload(assets.blob, assets.filename);
        markFeedback('saved');
        notify('Transparent PNG downloaded!');
        return;
      }

      if (kind === 'save' && platform === 'ios') {
        setPhotoSavePreview({
          dataUrl: assets.dataUrl,
          blob: assets.blob,
          filename: assets.filename,
        });
        return;
      }

      if (kind === 'share' && platform === 'ios') {
        setPhotoSavePreview({
          dataUrl: assets.dataUrl,
          blob: assets.blob,
          filename: assets.filename,
        });
        return;
      }

      triggerBlobDownload(assets.blob, assets.filename);
      markFeedback('saved');
      notify(
        platform === 'android'
          ? 'Saved to Phone Gallery / Downloads! Ready for Instagram Stories.'
          : 'Transparent PNG downloaded! Drop it over any photo in Instagram, WhatsApp, or Canva.'
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      notify('Could not export sticker. Please try again.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Transparent Story Sticker Chooser"
      onClick={() => {
        setPhotoSavePreview(null);
        setIsOpen(false);
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[92dvh] flex flex-col bg-[#F4F3EF] dark:bg-[#111317] text-[#111317] dark:text-[#F3F4F6] rounded-t-3xl sm:rounded-2xl border border-black/15 dark:border-white/15 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2.5 px-4 py-3 border-b border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                if (photoSavePreview) {
                  setPhotoSavePreview(null);
                } else {
                  setIsOpen(false);
                }
              }}
              aria-label={photoSavePreview ? 'Back to stickers' : 'Close sticker modal'}
              className="w-10 h-10 rounded-full border border-black/12 dark:border-white/15 bg-white dark:bg-[#090A0C] flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-[#14161C] shrink-0 cursor-pointer"
            >
              {photoSavePreview ? <ArrowLeft className="w-4 h-4" /> : <X className="w-4 h-4" />}
            </button>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.1em] text-[#4E6800] dark:text-[#C8FF00] font-semibold truncate">
                {photoSavePreview ? 'Save To Mobile Photos' : 'Story Macro Sticker · PNG'}
              </div>
              <h2 className="text-sm sm:text-base font-bold truncate">
                {effectiveFoodPayload.title} · {effectiveFoodPayload.calories.toLocaleString()} kcal
              </h2>
            </div>
          </div>

          {!photoSavePreview && (
            <div className="flex items-center gap-1.5 shrink-0" aria-label="Sticker ink color">
              {OVERLAY_COLOR_PRESETS.slice(0, 4).map((preset) => {
                const active =
                  transform.textColor === preset.textColor &&
                  transform.accentColor === preset.accentColor;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      setTransform((p) => ({
                        ...p,
                        textColor: preset.textColor,
                        accentColor: preset.accentColor,
                      }))
                    }
                    aria-label={`${preset.label} text`}
                    title={`${preset.label} text`}
                    className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 transition-transform cursor-pointer ${
                      active
                        ? 'scale-110 border-[#C8FF00] ring-2 ring-[#C8FF00]/30'
                        : 'border-black/20 dark:border-white/30'
                    }`}
                    style={{ backgroundColor: preset.textColor }}
                  />
                );
              })}
            </div>
          )}
        </div>

        {photoSavePreview ? (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3 flex flex-col items-center">
              <div className="w-full rounded-xl bg-lime-500/10 border border-lime-600/25 dark:border-[#C8FF00]/30 px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 text-center leading-relaxed">
                <strong>Touch &amp; hold</strong> the sticker below → tap{' '}
                <strong>Save to Photos</strong>, or tap <strong>Copy</strong> and paste straight onto
                your Instagram Story.
              </div>

              <div
                className="w-full max-w-[300px] h-[230px] rounded-2xl border border-black/15 dark:border-white/15 overflow-hidden shadow-lg p-3 flex items-center justify-center"
                style={CHECKERBOARD_STYLE}
              >
                <img
                  src={photoSavePreview.dataUrl}
                  alt={`${effectiveFoodPayload.title} transparent macro sticker`}
                  style={{ WebkitTouchCallout: 'default' }}
                  className="max-w-full max-h-full w-auto h-auto object-contain select-auto"
                />
              </div>
            </div>

            <div className="px-4 py-3 border-t border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] grid grid-cols-3 gap-2 shrink-0">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => void handleExport('copy')}
                className="min-h-[46px] px-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:border-[#C8FF00] transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                {feedbackState === 'copied' ? (
                  <Check className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00] shrink-0" />
                ) : (
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{feedbackState === 'copied' ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={() => void handleExport('force-file')}
                className="min-h-[46px] px-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:border-[#C8FF00] transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>{platform === 'ios' ? 'Save File' : 'Download'}</span>
              </button>

              <button
                type="button"
                onClick={() => setPhotoSavePreview(null)}
                className="min-h-[46px] px-2.5 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity whitespace-nowrap cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>Done</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3.5 space-y-2.5">
              <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400">
                Pick a transparent sticker layout and save to Photos for Instagram Stories.
              </p>

              <div className="grid grid-cols-2 gap-2.5">
                {FOOD_STICKER_TEMPLATES.map((tpl) => (
                  <FoodStickerPreviewTile
                    key={tpl.id}
                    templateId={tpl.id}
                    label={tpl.label}
                    selected={foodTemplate === tpl.id}
                    food={effectiveFoodPayload}
                    transform={transform}
                    onSelect={() => {
                      setPhotoSavePreview(null);
                      setFoodTemplate(tpl.id);
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="px-3.5 sm:px-4 py-3 border-t border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] grid grid-cols-[1fr_1.45fr_1fr] gap-2 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => void handleExport('copy')}
                className="min-h-[46px] px-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:border-[#C8FF00] transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                {feedbackState === 'copied' ? (
                  <Check className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00] shrink-0" />
                ) : (
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{feedbackState === 'copied' ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={() => void handleExport('save')}
                className="min-h-[46px] px-3 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                {feedbackState === 'saved' ? (
                  <Check className="w-4 h-4 shrink-0" />
                ) : isMobile ? (
                  <ImageIcon className="w-4 h-4 shrink-0" />
                ) : (
                  <Download className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {feedbackState === 'saved'
                    ? 'Saved!'
                    : isMobile
                    ? 'Save to Photos'
                    : 'Download PNG'}
                </span>
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={() => void handleExport('share')}
                className="min-h-[46px] px-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:border-[#C8FF00] transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 shrink-0 text-[#4E6800] dark:text-[#C8FF00]" />
                <span>Share</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
