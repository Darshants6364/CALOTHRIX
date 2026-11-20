import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Download, Image as ImageIcon, Share2, X } from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { formatShortDate, getTodayDateKey } from '../utils/dateUtils';
import { round1 } from '../utils/nutritionUtils';
import {
  FoodStickerTemplateId,
  OVERLAY_COLOR_PRESETS,
  OverlayTransform,
  renderOverlayToAssets,
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
  tag: string;
}[] = [
  { id: 'circle-row', label: '4 Circles Row', tag: 'Circle Row' },
  { id: 'single-line', label: 'Straight Bar', tag: '1-Line Bar' },
  { id: 'classic-circles', label: '2×2 Circles', tag: 'Macro Rings' },
  { id: 'vertical-rail', label: 'Edge Strip', tag: 'Side Rail' },
];

const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundColor: '#3D4048',
  backgroundImage:
    'linear-gradient(45deg, #525660 25%, transparent 25%), linear-gradient(-45deg, #525660 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #525660 75%), linear-gradient(-45deg, transparent 75%, #525660 75%)',
  backgroundSize: '24px 24px',
  backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0',
};

function detectMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && typeof window !== 'undefined' && window.innerWidth < 1024)
  );
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
  tag: string;
  selected: boolean;
  food: ShareFoodPayload;
  transform: OverlayTransform;
  onSelect: () => void;
}

const FoodStickerPreviewTile: React.FC<FoodStickerPreviewTileProps> = ({
  templateId,
  label,
  tag,
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
      className={`group relative aspect-[9/15] w-full rounded-2xl overflow-hidden transition-all text-left border-2 ${
        selected
          ? 'border-[#111317] dark:border-[#C8FF00] ring-2 ring-[#C8FF00]/40 scale-[0.99]'
          : 'border-black/15 dark:border-white/15 hover:border-black/35 dark:hover:border-white/35'
      }`}
      style={CHECKERBOARD_STYLE}
      aria-pressed={selected}
      aria-label={`Select ${label} transparent sticker`}
    >
      <canvas ref={canvasRef} className="w-full h-full object-contain pointer-events-none block" />

      <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-[#090A0C]/75 backdrop-blur-xs text-[10px] font-mono uppercase tracking-wider text-white">
        {tag}
      </div>

      <div
        className={`absolute top-2.5 right-2.5 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
          selected
            ? 'bg-[#C8FF00] text-[#090A0C]'
            : 'bg-[#090A0C]/55 text-white/60 border border-white/30'
        }`}
      >
        <Check className="w-3.5 h-3.5 stroke-[2.75]" />
      </div>

      <div className="absolute inset-x-0 bottom-0 px-3 py-2 bg-gradient-to-t from-[#090A0C]/80 to-transparent flex items-center justify-between">
        <span className="text-xs font-semibold text-white">{label}</span>
        <span className="text-[10px] font-mono text-white/75 uppercase">PNG</span>
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
  const [photoSavePreview, setPhotoSavePreview] = useState<{
    dataUrl: string;
    blob: Blob;
    filename: string;
  } | null>(null);

  const cachedAssetsRef = useRef<CachedStickerAssets | null>(null);
  const todayKey = getTodayDateKey();
  const isMobile = useMemo(() => detectMobileDevice(), []);

  useEffect(() => {
    const handler = (ev: Event) => {
      const custom = ev as CustomEvent<OpenShareStudioDetail>;
      const detail = custom.detail || {};
      setFoodPayload(detail.foodPayload || null);
      setTransform(DEFAULT_TRANSFORM);
      setPhotoSavePreview(null);
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
        .replace(/^-|-$/g, '') || 'food';
    return `calothrix-${slugTitle}-transparent-${dateSlug}.png`;
  }, [effectiveFoodPayload.title, selectedDate, todayKey]);

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

  // Pre-render the active sticker while the modal is open so mobile navigator.share()
  // can be invoked synchronously inside the tap gesture without losing user activation.
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
        // Non-fatal; handleExport renders on demand
      }
    }, 60);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [buildFilename, buildOverlayParams, currentAssetKey, isOpen]);

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

  const tryNativeShareFile = async (assets: CachedStickerAssets): Promise<'shared' | 'aborted' | 'unavailable'> => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      return 'unavailable';
    }
    const canShareFiles =
      typeof navigator.canShare === 'function' && navigator.canShare({ files: [assets.file] });
    if (!canShareFiles) {
      return 'unavailable';
    }

    try {
      await navigator.share({
        files: [assets.file],
        title: `${effectiveFoodPayload.title} · CALOTHRIX`,
      });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return 'aborted';
      }
      return 'unavailable';
    }
  };

  const handleExport = async (kind: 'transparent' | 'share' | 'copy' | 'force-file') => {
    const cached =
      cachedAssetsRef.current && cachedAssetsRef.current.key === currentAssetKey
        ? cachedAssetsRef.current
        : null;

    // Invoke native Share Sheet synchronously on cached assets so iOS Safari keeps user activation
    if (
      cached &&
      (kind === 'share' || (kind === 'transparent' && isMobile)) &&
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [cached.file] })
    ) {
      setIsExporting(true);
      try {
        await navigator.share({
          files: [cached.file],
          title: `${effectiveFoodPayload.title} · CALOTHRIX`,
        });
        notify(
          kind === 'transparent'
            ? 'Choose "Save Image" or Photos in the menu to save directly to your Photos.'
            : 'Shared transparent sticker!'
        );
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (isMobile) {
          setPhotoSavePreview({
            dataUrl: cached.dataUrl,
            blob: cached.blob,
            filename: cached.filename,
          });
          return;
        }
      } finally {
        setIsExporting(false);
      }
    }

    setIsExporting(true);
    try {
      const assets = cached ?? (await getOrRenderAssets());

      if (kind === 'force-file') {
        triggerBlobDownload(assets.blob, assets.filename);
        notify('Transparent PNG downloaded to Files.');
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
            notify('Transparent sticker copied! Paste it straight over any story photo.');
            return;
          } catch {
            // Fall through below on mobile Safari/WebView clipboard restrictions
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
        notify('Transparent PNG downloaded!');
        return;
      }

      if (kind === 'share' || (kind === 'transparent' && isMobile)) {
        const shareStatus = await tryNativeShareFile(assets);
        if (shareStatus === 'shared') {
          notify(
            kind === 'transparent'
              ? 'Choose "Save Image" or Photos in the menu to save directly to your Photos.'
              : 'Shared transparent sticker!'
          );
          return;
        }
        if (shareStatus === 'aborted') {
          return;
        }

        // On mobile when Share Sheet is unavailable/blocked (e.g. iframe), show native <img>
        // so long-pressing saves directly to iPhone/Android Photos instead of Files!
        if (isMobile) {
          setPhotoSavePreview({
            dataUrl: assets.dataUrl,
            blob: assets.blob,
            filename: assets.filename,
          });
          return;
        }
      }

      triggerBlobDownload(assets.blob, assets.filename);
      notify('Transparent PNG sticker saved! Drop it over any photo in Instagram, WhatsApp, or Canva.');
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
      aria-label="Transparent Food Sticker Chooser"
      onClick={() => {
        setPhotoSavePreview(null);
        setIsOpen(false);
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-xl max-h-[94dvh] flex flex-col bg-[#F4F3EF] dark:bg-[#111317] text-[#111317] dark:text-[#F3F4F6] rounded-t-3xl sm:rounded-2xl border border-black/15 dark:border-white/15 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
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
              className="w-10 h-10 rounded-full border border-black/12 dark:border-white/15 bg-white dark:bg-[#090A0C] flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-[#14161C] shrink-0"
            >
              {photoSavePreview ? <ArrowLeft className="w-4 h-4" /> : <X className="w-4 h-4" />}
            </button>
            <div className="min-w-0">
              <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#4E6800] dark:text-[#C8FF00] font-semibold">
                {photoSavePreview ? 'Save Directly To Photos' : 'Transparent PNG Sticker Only'}
              </div>
              <h2 className="text-sm sm:text-base font-bold truncate">
                {effectiveFoodPayload.title} · {effectiveFoodPayload.calories} kcal
              </h2>
            </div>
          </div>

          {!photoSavePreview && (
            <div className="flex items-center gap-1.5 shrink-0" title="Sticker text color">
              {OVERLAY_COLOR_PRESETS.slice(0, 3).map((preset) => {
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
                    aria-label={`${preset.label} ink`}
                    title={`${preset.label} text`}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${
                      active ? 'scale-110 border-[#C8FF00]' : 'border-black/20 dark:border-white/25'
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
              <div className="w-full rounded-xl bg-lime-500/12 border border-lime-600/25 dark:border-[#C8FF00]/30 px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 text-center">
                <strong>Touch &amp; hold</strong> the sticker image below, then tap{' '}
                <strong>Save to Photos</strong> (iPhone) or <strong>Download image</strong> (Android).
              </div>

              <div
                className="w-full max-w-[260px] aspect-[9/15] rounded-2xl border border-black/15 dark:border-white/15 overflow-hidden shadow-lg"
                style={CHECKERBOARD_STYLE}
              >
                <img
                  src={photoSavePreview.dataUrl}
                  alt={`${effectiveFoodPayload.title} transparent macro sticker`}
                  className="w-full h-full object-contain select-auto"
                />
              </div>
            </div>

            <div className="px-4 sm:px-5 py-3.5 border-t border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] grid grid-cols-2 gap-2.5 shrink-0">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => void handleExport('force-file')}
                className="min-h-[48px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:border-[#C8FF00] transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>Download File</span>
              </button>

              <button
                type="button"
                onClick={() => setPhotoSavePreview(null)}
                className="min-h-[48px] px-3 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
              >
                <Check className="w-4 h-4 shrink-0" />
                <span>Done</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3.5 sm:p-4 space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Select 1 of 4 transparent Calorie, Protein, Carbs &amp; Fat overlays. Save &amp; drop onto any gym or meal photo.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {FOOD_STICKER_TEMPLATES.map((tpl) => (
                  <FoodStickerPreviewTile
                    key={tpl.id}
                    templateId={tpl.id}
                    label={tpl.label}
                    tag={tpl.tag}
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

            <div className="px-4 sm:px-5 py-3.5 border-t border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] grid grid-cols-3 gap-2.5 shrink-0">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => void handleExport('copy')}
                className="min-h-[48px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:border-[#C8FF00] transition-colors disabled:opacity-50"
              >
                <Copy className="w-4 h-4 shrink-0" />
                <span>Copy</span>
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={() => void handleExport('transparent')}
                className="min-h-[48px] px-3 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isMobile ? (
                  <ImageIcon className="w-4 h-4 shrink-0" />
                ) : (
                  <Download className="w-4 h-4 shrink-0" />
                )}
                <span>{isMobile ? 'Save to Photos' : 'Save PNG'}</span>
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={() => void handleExport('share')}
                className="min-h-[48px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:border-[#C8FF00] transition-colors disabled:opacity-50"
              >
                <Share2 className="w-4 h-4 shrink-0 text-[#4E6800] dark:text-[#C8FF00]" />
                <span>Share</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
