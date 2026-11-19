export type ShareStudioMode = 'food' | 'macros' | 'streak' | 'journey';

export type FoodStickerTemplateId =
  | 'circle-row'
  | 'single-line'
  | 'classic-circles'
  | 'vertical-rail';

export type MacroTemplateId =
  | 'classic-circles'
  | 'minimal-type'
  | 'macro-rings'
  | 'sports-performance';

export type StreakTemplateId = 'streak-ring' | 'streak-minimal' | 'streak-athletic';

export type JourneyTemplateId = 'journey-editorial' | 'journey-minimal' | 'journey-sports';

export interface OverlayTransform {
  /** Normalized offset relative to canvas center (-0.38 to +0.38 of width/height) */
  posX: number;
  posY: number;
  /** Scale multiplier (0.55 to 1.65) */
  scale: number;
  /** Rotation in degrees (-35 to +35) */
  rotationDeg: number;
  /** Global alpha opacity (0.25 to 1.0) */
  opacity: number;
  /** Primary stroke & text color */
  textColor: string;
  /** Highlight / accent arc & emblem color */
  accentColor: string;
  /** Show subtle CALOTHRIX wordmark */
  showBranding: boolean;
  /** Include date stamp */
  showDate: boolean;
}

export interface ShareMacrosPayload {
  calories: number;
  calorieGoal: number;
  protein: number;
  proteinGoal: number;
  carbs: number;
  carbsGoal: number;
  fat: number;
  fatGoal: number;
  dateLabel: string;
}

export interface ShareStreakPayload {
  currentStreak: number;
  longestStreak: number;
  headline: string;
  milestoneLabel: string;
  weeklyConsistencyPct: number;
  dateLabel: string;
}

export interface ShareJourneyPayload {
  title: string;
  startingWeightLabel: string;
  currentWeightLabel: string;
  deltaLabel: string;
  daysTracked: number;
  avgProteinLabel: string;
  proteinConsistencyPct: number;
  directionLabel: string;
  dateLabel: string;
}

export interface ShareFoodPayload {
  title: string;
  subtitle?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  dateLabel: string;
}

export interface RenderOverlayParams {
  mode: ShareStudioMode;
  foodTemplate?: FoodStickerTemplateId;
  macroTemplate: MacroTemplateId;
  streakTemplate: StreakTemplateId;
  journeyTemplate: JourneyTemplateId;
  transform: OverlayTransform;
  food?: ShareFoodPayload;
  macros: ShareMacrosPayload;
  streak: ShareStreakPayload;
  journey: ShareJourneyPayload;
  photoImg?: HTMLImageElement | null;
  beforeImg?: HTMLImageElement | null;
  afterImg?: HTMLImageElement | null;
  transparentOnly?: boolean;
}

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

export const OVERLAY_COLOR_PRESETS: {
  id: string;
  label: string;
  textColor: string;
  accentColor: string;
}[] = [
  { id: 'white-lime', label: 'Pure White', textColor: '#FFFFFF', accentColor: '#C8FF00' },
  { id: 'obsidian', label: 'Obsidian Black', textColor: '#090A0C', accentColor: '#4E6800' },
  { id: 'electric-lime', label: 'Electric Lime', textColor: '#C8FF00', accentColor: '#FFFFFF' },
  { id: 'warm-amber', label: 'Solar Amber', textColor: '#FBBF24', accentColor: '#FFFFFF' },
  { id: 'ice-cyan', label: 'Cryo Cyan', textColor: '#38BDF8', accentColor: '#FFFFFF' },
];

export function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
): void {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;

  const targetRatio = dw / dh;
  const imgRatio = iw / ih;

  let sx = 0;
  let sy = 0;
  let sw = iw;
  let sh = ih;

  if (imgRatio > targetRatio) {
    sw = ih * targetRatio;
    sx = (iw - sw) / 2;
  } else {
    sh = iw / targetRatio;
    sy = (ih - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * Computes average perceptual luminance around the overlay placement region
 * on an uploaded personal photo and returns the optimal high-contrast color preset.
 */
export function analyzeImageRegionLuminance(
  img: HTMLImageElement,
  posX: number,
  posY: number
): {
  avgLuminance: number;
  recommendedPresetId: string;
  recommendedLabel: string;
  textColor: string;
  accentColor: string;
} {
  const sampleW = 120;
  const sampleH = 213;
  const off = document.createElement('canvas');
  off.width = sampleW;
  off.height = sampleH;
  const ctx = off.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      avgLuminance: 40,
      recommendedPresetId: 'white-lime',
      recommendedLabel: 'Crisp White (High contrast)',
      textColor: '#FFFFFF',
      accentColor: '#C8FF00',
    };
  }

  drawCoverImage(ctx, img, 0, 0, sampleW, sampleH);

  // Sample region around posX/posY (~36% box width/height around target)
  const cx = Math.round((0.5 + posX) * sampleW);
  const cy = Math.round((0.5 + posY) * sampleH);
  const rx = Math.round(sampleW * 0.24);
  const ry = Math.round(sampleH * 0.16);
  const x0 = Math.max(0, cx - rx);
  const y0 = Math.max(0, cy - ry);
  const x1 = Math.min(sampleW, cx + rx);
  const y1 = Math.min(sampleH, cy + ry);
  const rw = Math.max(4, x1 - x0);
  const rh = Math.max(4, y1 - y0);

  const data = ctx.getImageData(x0, y0, rw, rh).data;
  let lumSum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    lumSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    count += 1;
  }
  const avgLuminance = count > 0 ? lumSum / count : 60;

  if (avgLuminance >= 165) {
    return {
      avgLuminance,
      recommendedPresetId: 'obsidian',
      recommendedLabel: 'Obsidian Black recommended (bright photo)',
      textColor: '#090A0C',
      accentColor: '#4E6800',
    };
  }
  if (avgLuminance <= 95) {
    return {
      avgLuminance,
      recommendedPresetId: 'white-lime',
      recommendedLabel: 'Pure White recommended (dark photo)',
      textColor: '#FFFFFF',
      accentColor: '#C8FF00',
    };
  }
  return {
    avgLuminance,
    recommendedPresetId: 'electric-lime',
    recommendedLabel: 'Electric Lime recommended (mid-tone photo)',
    textColor: '#C8FF00',
    accentColor: '#FFFFFF',
  };
}

function drawCalothrixBrandMark(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  y: number,
  color: string,
  _accentColor: string,
  dateLabel?: string
) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (dateLabel) {
    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.fillStyle = color;
    ctx.globalAlpha *= 0.85;
    ctx.fillText(dateLabel.toUpperCase(), centerX, y - 34);
    ctx.globalAlpha /= 0.85;
  }

  ctx.font = '800 30px "Archivo", sans-serif';
  ctx.fillStyle = color;
  ctx.fillText('CALOTHRIX', centerX, y);
  ctx.restore();
}

function drawMacroClassicCircles(
  ctx: CanvasRenderingContext2D,
  macros: ShareMacrosPayload,
  transform: OverlayTransform
) {
  const { textColor, accentColor } = transform;
  const items = [
    {
      label: 'CALORIES',
      value: macros.calories.toLocaleString(),
      unit: 'KCAL',
      cx: -175,
      cy: -175,
      isPrimary: true,
    },
    {
      label: 'PROTEIN',
      value: `${Math.round(macros.protein)}g`,
      unit: 'PROTEIN',
      cx: 175,
      cy: -175,
      isPrimary: false,
    },
    {
      label: 'CARBS',
      value: `${Math.round(macros.carbs)}g`,
      unit: 'CARBS',
      cx: -175,
      cy: 175,
      isPrimary: false,
    },
    {
      label: 'FAT',
      value: `${Math.round(macros.fat)}g`,
      unit: 'FAT',
      cx: 175,
      cy: 175,
      isPrimary: false,
    },
  ];

  const radius = 148;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const item of items) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(item.cx, item.cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = item.isPrimary ? accentColor : textColor;
    ctx.lineWidth = item.isPrimary ? 5.5 : 4;
    ctx.stroke();

    // Inner subtle hairline ring
    ctx.beginPath();
    ctx.arc(item.cx, item.cy, radius - 12, 0, Math.PI * 2);
    ctx.strokeStyle = textColor;
    ctx.globalAlpha *= 0.18;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Numeric value
    ctx.fillStyle = item.isPrimary ? accentColor : textColor;
    ctx.font = '800 66px "Archivo", sans-serif';
    ctx.fillText(item.value, item.cx, item.cy - 10);

    // Label below number
    ctx.fillStyle = textColor;
    ctx.font = '700 22px "JetBrains Mono", monospace';
    ctx.fillText(item.isPrimary ? item.unit : item.label, item.cx, item.cy + 48);
  }

  if (transform.showBranding || transform.showDate) {
    drawCalothrixBrandMark(
      ctx,
      0,
      405,
      textColor,
      accentColor,
      transform.showDate ? macros.dateLabel : undefined
    );
  }
}

function drawMacroMinimalType(
  ctx: CanvasRenderingContext2D,
  macros: ShareMacrosPayload,
  transform: OverlayTransform
) {
  const { textColor, accentColor } = transform;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Eyebrow
  ctx.fillStyle = accentColor;
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillText('DAILY NUTRITION', 0, -185);

  // Oversized Calories
  ctx.fillStyle = textColor;
  ctx.font = '900 162px "Archivo", sans-serif';
  ctx.fillText(macros.calories.toLocaleString(), 0, -82);

  ctx.fillStyle = accentColor;
  ctx.font = '700 28px "JetBrains Mono", monospace';
  ctx.fillText('KCAL LOGGED', 0, 14);

  // Clean hairline divider (zero background box)
  ctx.save();
  ctx.strokeStyle = textColor;
  ctx.globalAlpha *= 0.35;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-290, 62);
  ctx.lineTo(290, 62);
  ctx.stroke();
  ctx.restore();

  // 3 Macro columns
  const cols = [
    { label: 'PROTEIN', value: `${Math.round(macros.protein)}g`, x: -215 },
    { label: 'CARBS', value: `${Math.round(macros.carbs)}g`, x: 0 },
    { label: 'FAT', value: `${Math.round(macros.fat)}g`, x: 215 },
  ];

  for (const col of cols) {
    ctx.fillStyle = textColor;
    ctx.font = '800 58px "Archivo", sans-serif';
    ctx.fillText(col.value, col.x, 134);

    ctx.fillStyle = textColor;
    ctx.save();
    ctx.globalAlpha *= 0.78;
    ctx.font = '600 20px "JetBrains Mono", monospace';
    ctx.fillText(col.label, col.x, 184);
    ctx.restore();
  }

  if (transform.showBranding || transform.showDate) {
    drawCalothrixBrandMark(
      ctx,
      0,
      292,
      textColor,
      accentColor,
      transform.showDate ? macros.dateLabel : undefined
    );
  }
}

function drawMacroRings(
  ctx: CanvasRenderingContext2D,
  macros: ShareMacrosPayload,
  transform: OverlayTransform
) {
  const { textColor, accentColor } = transform;
  const items = [
    {
      label: 'KCAL',
      value: macros.calories.toLocaleString(),
      pct: macros.calorieGoal > 0 ? Math.min(1, macros.calories / macros.calorieGoal) : 0.75,
      cx: -175,
      cy: -170,
      ringColor: accentColor,
    },
    {
      label: 'PROTEIN',
      value: `${Math.round(macros.protein)}g`,
      pct: macros.proteinGoal > 0 ? Math.min(1, macros.protein / macros.proteinGoal) : 0.7,
      cx: 175,
      cy: -170,
      ringColor: textColor,
    },
    {
      label: 'CARBS',
      value: `${Math.round(macros.carbs)}g`,
      pct: macros.carbsGoal > 0 ? Math.min(1, macros.carbs / macros.carbsGoal) : 0.65,
      cx: -175,
      cy: 170,
      ringColor: textColor,
    },
    {
      label: 'FAT',
      value: `${Math.round(macros.fat)}g`,
      pct: macros.fatGoal > 0 ? Math.min(1, macros.fat / macros.fatGoal) : 0.6,
      cx: 175,
      cy: 170,
      ringColor: textColor,
    },
  ];

  const radius = 136;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const item of items) {
    // Track arc
    ctx.save();
    ctx.beginPath();
    ctx.arc(item.cx, item.cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = textColor;
    ctx.globalAlpha *= 0.22;
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.restore();

    // Progress arc starting from 12 o'clock
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + Math.max(0.06, item.pct) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(item.cx, item.cy, radius, startAngle, endAngle);
    ctx.strokeStyle = item.ringColor;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = '800 58px "Archivo", sans-serif';
    ctx.fillText(item.value, item.cx, item.cy - 12);

    ctx.fillStyle = accentColor;
    ctx.font = '700 21px "JetBrains Mono", monospace';
    ctx.fillText(`${item.label} · ${Math.round(item.pct * 100)}%`, item.cx, item.cy + 42);
  }

  if (transform.showBranding || transform.showDate) {
    drawCalothrixBrandMark(
      ctx,
      0,
      395,
      textColor,
      accentColor,
      transform.showDate ? macros.dateLabel : undefined
    );
  }
}

function drawMacroSportsPerformance(
  ctx: CanvasRenderingContext2D,
  macros: ShareMacrosPayload,
  transform: OverlayTransform
) {
  const { textColor, accentColor } = transform;
  const leftX = -290;

  // Vertical crisp accent bar
  ctx.fillStyle = accentColor;
  ctx.fillRect(leftX, -245, 8, 420);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = accentColor;
  ctx.font = '700 22px "JetBrains Mono", monospace';
  ctx.fillText('FUEL PERFORMANCE LOG', leftX + 34, -225);

  // Oversized Calories
  ctx.fillStyle = textColor;
  ctx.font = '900 132px "Archivo", sans-serif';
  ctx.fillText(`${macros.calories.toLocaleString()}`, leftX + 32, -125);

  ctx.fillStyle = textColor;
  ctx.save();
  ctx.globalAlpha *= 0.82;
  ctx.font = '700 26px "JetBrains Mono", monospace';
  ctx.fillText(
    macros.calorieGoal > 0 ? `KCAL / ${macros.calorieGoal.toLocaleString()} TARGET` : 'KCAL',
    leftX + 34,
    -42
  );
  ctx.restore();

  // Horizontal row
  const stats = [
    { label: 'PROTEIN', value: `${Math.round(macros.protein)}g`, x: leftX + 34 },
    { label: 'CARBS', value: `${Math.round(macros.carbs)}g`, x: leftX + 245 },
    { label: 'FAT', value: `${Math.round(macros.fat)}g`, x: leftX + 445 },
  ];

  for (const s of stats) {
    ctx.fillStyle = accentColor;
    ctx.font = '700 20px "JetBrains Mono", monospace';
    ctx.fillText(s.label, s.x, 45);

    ctx.fillStyle = textColor;
    ctx.font = '800 62px "Archivo", sans-serif';
    ctx.fillText(s.value, s.x, 112);
  }

  if (transform.showBranding || transform.showDate) {
    drawCalothrixBrandMark(
      ctx,
      0,
      275,
      textColor,
      accentColor,
      transform.showDate ? macros.dateLabel : undefined
    );
  }
}

function drawStreakOverlay(
  ctx: CanvasRenderingContext2D,
  template: StreakTemplateId,
  streak: ShareStreakPayload,
  transform: OverlayTransform
) {
  const { textColor, accentColor } = transform;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (template === 'streak-ring') {
    const r = 195;
    // Outer ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, -65, r, 0, Math.PI * 2);
    ctx.strokeStyle = textColor;
    ctx.globalAlpha *= 0.25;
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.restore();

    // Accent arc
    ctx.beginPath();
    ctx.arc(0, -65, r, -Math.PI / 2, Math.PI * 1.15);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.fillStyle = accentColor;
    ctx.font = '900 165px "Archivo", sans-serif';
    ctx.fillText(String(streak.currentStreak), 0, -82);

    ctx.fillStyle = textColor;
    ctx.font = '700 26px "JetBrains Mono", monospace';
    ctx.fillText(streak.currentStreak === 1 ? 'DAY STREAK' : 'DAYS STREAK', 0, 22);

    ctx.fillStyle = textColor;
    ctx.font = '800 44px "Archivo", sans-serif';
    ctx.fillText(streak.headline.toUpperCase(), 0, 200);

    ctx.save();
    ctx.globalAlpha *= 0.8;
    ctx.fillStyle = textColor;
    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.fillText(
      `BEST ${streak.longestStreak}D · WEEKLY ${streak.weeklyConsistencyPct}%`,
      0,
      252
    );
    ctx.restore();
  } else if (template === 'streak-minimal') {
    ctx.fillStyle = accentColor;
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillText(streak.milestoneLabel.toUpperCase(), 0, -170);

    ctx.fillStyle = textColor;
    ctx.font = '900 185px "Archivo", sans-serif';
    ctx.fillText(`${streak.currentStreak}D`, 0, -48);

    ctx.fillStyle = textColor;
    ctx.font = '800 42px "Archivo", sans-serif';
    ctx.fillText(streak.headline.toUpperCase(), 0, 82);

    ctx.save();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-120, 128);
    ctx.lineTo(120, 128);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = textColor;
    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.fillText(`LONGEST STREAK ${streak.longestStreak} DAYS`, 0, 174);
  } else {
    // streak-athletic
    const leftX = -290;
    ctx.fillStyle = accentColor;
    ctx.fillRect(leftX, -180, 10, 340);

    ctx.textAlign = 'left';
    ctx.fillStyle = accentColor;
    ctx.font = '700 22px "JetBrains Mono", monospace';
    ctx.fillText('CONSISTENCY MILESTONE', leftX + 34, -155);

    ctx.fillStyle = textColor;
    ctx.font = '900 135px "Archivo", sans-serif';
    ctx.fillText(`${streak.currentStreak} DAYS`, leftX + 32, -55);

    ctx.fillStyle = textColor;
    ctx.font = '800 44px "Archivo", sans-serif';
    ctx.fillText(streak.headline.toUpperCase(), leftX + 34, 42);

    ctx.fillStyle = accentColor;
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillText(
      `BEST: ${streak.longestStreak}D   ·   WEEK: ${streak.weeklyConsistencyPct}%`,
      leftX + 34,
      115
    );
  }

  if (transform.showBranding || transform.showDate) {
    drawCalothrixBrandMark(
      ctx,
      0,
      345,
      textColor,
      accentColor,
      transform.showDate ? streak.dateLabel : undefined
    );
  }
}

function drawJourneyOverlay(
  ctx: CanvasRenderingContext2D,
  template: JourneyTemplateId,
  journey: ShareJourneyPayload,
  transform: OverlayTransform
) {
  const { textColor, accentColor } = transform;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (template === 'journey-editorial') {
    ctx.fillStyle = accentColor;
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillText(journey.directionLabel.toUpperCase(), 0, -235);

    ctx.fillStyle = textColor;
    ctx.font = '900 56px "Archivo", sans-serif';
    ctx.fillText(journey.title.toUpperCase(), 0, -172);

    // Starting -> Current large figure
    ctx.fillStyle = accentColor;
    ctx.font = '900 96px "Archivo", sans-serif';
    ctx.fillText(`${journey.startingWeightLabel} → ${journey.currentWeightLabel}`, 0, -56);

    ctx.fillStyle = textColor;
    ctx.font = '800 42px "Archivo", sans-serif';
    ctx.fillText(`NET CHANGE: ${journey.deltaLabel}`, 0, 28);

    // Hairline
    ctx.save();
    ctx.strokeStyle = textColor;
    ctx.globalAlpha *= 0.3;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-290, 82);
    ctx.lineTo(290, 82);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = textColor;
    ctx.font = '700 26px "JetBrains Mono", monospace';
    ctx.fillText(
      `TRACKED ${journey.daysTracked} DAYS · AVG ${journey.avgProteinLabel}/DAY PROTEIN`,
      0,
      142
    );
    ctx.fillStyle = accentColor;
    ctx.font = '700 22px "JetBrains Mono", monospace';
    ctx.fillText(`${journey.proteinConsistencyPct}% PROTEIN TARGET CONSISTENCY`, 0, 186);
  } else if (template === 'journey-minimal') {
    ctx.fillStyle = accentColor;
    ctx.font = '700 22px "JetBrains Mono", monospace';
    ctx.fillText(journey.title.toUpperCase(), 0, -195);

    ctx.fillStyle = textColor;
    ctx.font = '900 132px "Archivo", sans-serif';
    ctx.fillText(journey.deltaLabel, 0, -82);

    ctx.fillStyle = textColor;
    ctx.font = '700 30px "JetBrains Mono", monospace';
    ctx.fillText(`${journey.startingWeightLabel}  →  ${journey.currentWeightLabel}`, 0, 14);

    ctx.fillStyle = accentColor;
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillText(
      `${journey.daysTracked} DAYS LOGGED  ·  ${journey.avgProteinLabel} AVG PROTEIN`,
      0,
      100
    );
  } else {
    // journey-sports
    const leftX = -305;
    ctx.fillStyle = accentColor;
    ctx.fillRect(leftX, -225, 10, 415);

    ctx.textAlign = 'left';
    ctx.fillStyle = accentColor;
    ctx.font = '700 22px "JetBrains Mono", monospace';
    ctx.fillText(journey.title.toUpperCase(), leftX + 34, -205);

    ctx.fillStyle = textColor;
    ctx.font = '900 118px "Archivo", sans-serif';
    ctx.fillText(journey.deltaLabel, leftX + 32, -108);

    ctx.fillStyle = textColor;
    ctx.font = '700 34px "Archivo", sans-serif';
    ctx.fillText(
      `START ${journey.startingWeightLabel}  /  NOW ${journey.currentWeightLabel}`,
      leftX + 34,
      -12
    );

    ctx.fillStyle = accentColor;
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillText(`DAYS TRACKED: ${journey.daysTracked}`, leftX + 34, 66);
    ctx.fillStyle = textColor;
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillText(
      `AVG PROTEIN: ${journey.avgProteinLabel}/DAY (${journey.proteinConsistencyPct}%)`,
      leftX + 34,
      118
    );
  }

  if (transform.showBranding || transform.showDate) {
    drawCalothrixBrandMark(
      ctx,
      0,
      300,
      textColor,
      accentColor,
      transform.showDate ? journey.dateLabel : undefined
    );
  }
}

function formatGrams(v: number): string {
  const rounded = Math.round(v * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}g`;
}

function drawFoodStickerOverlay(
  ctx: CanvasRenderingContext2D,
  template: FoodStickerTemplateId,
  food: ShareFoodPayload,
  transform: OverlayTransform
) {
  const { textColor, accentColor } = transform;
  const calStr = `${Math.round(food.calories).toLocaleString()}`;
  const proStr = formatGrams(food.protein);
  const carbStr = formatGrams(food.carbs);
  const fatStr = formatGrams(food.fat);

  if (template === 'circle-row' || template === 'single-line') {
    if (template === 'circle-row') {
      // Exact handwritten 4-circle horizontal row: [Cal] [Protein] [Carbs] [Fat]
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const circles = [
        { top: 'C', val: calStr, bottom: 'KCAL', x: -366, primary: true },
        { top: 'P', val: proStr, bottom: 'PROTEIN', x: -122, primary: false },
        { top: 'C', val: carbStr, bottom: 'CARBS', x: 122, primary: false },
        { top: 'F', val: fatStr, bottom: 'FAT', x: 366, primary: false },
      ];
      const radius = 108;

      for (const c of circles) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(c.x, 0, radius, 0, Math.PI * 2);
        ctx.strokeStyle = c.primary ? accentColor : textColor;
        ctx.lineWidth = c.primary ? 5 : 4;
        ctx.stroke();
        ctx.restore();

        // Short letter/label at top inside circle
        ctx.save();
        ctx.fillStyle = c.primary ? accentColor : textColor;
        ctx.globalAlpha *= 0.85;
        ctx.font = '700 20px "JetBrains Mono", monospace';
        ctx.fillText(c.top, c.x, -54);
        ctx.restore();

        // Main numeric value
        ctx.fillStyle = c.primary ? accentColor : textColor;
        ctx.font = calStr.length >= 4 && c.primary ? '900 46px "Archivo", sans-serif' : '900 50px "Archivo", sans-serif';
        ctx.fillText(c.val, c.x, 2);

        // Unit / macro word at bottom inside circle
        ctx.save();
        ctx.fillStyle = textColor;
        ctx.globalAlpha *= 0.82;
        ctx.font = '700 18px "JetBrains Mono", monospace';
        ctx.fillText(c.bottom, c.x, 56);
        ctx.restore();
      }

      if (transform.showBranding) {
        drawCalothrixBrandMark(ctx, 0, 175, textColor, accentColor);
      }
      return;
    }

    // Straight horizontal bar: ONLY Calories | Protein | Carbs | Fat
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const cols = [
      { label: 'CALORIES', val: `${calStr} kcal`, x: -345, accent: true },
      { label: 'PROTEIN', val: proStr, x: -115, accent: false },
      { label: 'CARBS', val: carbStr, x: 115, accent: false },
      { label: 'FAT', val: fatStr, x: 345, accent: false },
    ];

    // Top & bottom straight bar hairlines (zero solid fill)
    ctx.save();
    ctx.strokeStyle = textColor;
    ctx.globalAlpha *= 0.4;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-455, -68);
    ctx.lineTo(455, -68);
    ctx.moveTo(-455, 70);
    ctx.lineTo(455, 70);
    ctx.stroke();
    ctx.restore();

    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      ctx.fillStyle = c.accent ? accentColor : textColor;
      ctx.font = '900 48px "Archivo", sans-serif';
      ctx.fillText(c.val, c.x, -16);

      ctx.save();
      ctx.fillStyle = textColor;
      ctx.globalAlpha *= 0.82;
      ctx.font = '700 19px "JetBrains Mono", monospace';
      ctx.fillText(c.label, c.x, 34);
      ctx.restore();

      if (i < cols.length - 1) {
        ctx.save();
        ctx.strokeStyle = textColor;
        ctx.globalAlpha *= 0.28;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c.x + 115, -46);
        ctx.lineTo(c.x + 115, 46);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (transform.showBranding) {
      drawCalothrixBrandMark(ctx, 0, 148, textColor, accentColor);
    }
    return;
  }

  if (template === 'classic-circles') {
    // 2x2 large circular rings: ONLY Calories, Protein, Carbs, Fat
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const items = [
      { label: 'CALORIES', value: calStr, unit: 'KCAL', cx: -175, cy: -165, primary: true },
      { label: 'PROTEIN', value: proStr, unit: 'PROTEIN', cx: 175, cy: -165, primary: false },
      { label: 'CARBS', value: carbStr, unit: 'CARBS', cx: -175, cy: 165, primary: false },
      { label: 'FAT', value: fatStr, unit: 'FAT', cx: 175, cy: 165, primary: false },
    ];
    const radius = 144;

    for (const item of items) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(item.cx, item.cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = item.primary ? accentColor : textColor;
      ctx.lineWidth = item.primary ? 5.5 : 4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(item.cx, item.cy, radius - 12, 0, Math.PI * 2);
      ctx.strokeStyle = textColor;
      ctx.globalAlpha *= 0.2;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = item.primary ? accentColor : textColor;
      ctx.font = '800 62px "Archivo", sans-serif';
      ctx.fillText(item.value, item.cx, item.cy - 10);

      ctx.fillStyle = textColor;
      ctx.font = '700 22px "JetBrains Mono", monospace';
      ctx.fillText(item.unit, item.cx, item.cy + 46);
    }

    if (transform.showBranding) {
      drawCalothrixBrandMark(ctx, 0, 385, textColor, accentColor);
    }
    return;
  }

  // 'vertical-rail' (Strava-style edge strip: ONLY Calories, Protein, Carbs, Fat)
  if (transform.showBranding) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textColor;
    ctx.font = '800 34px "Archivo", sans-serif';
    ctx.fillText('CALOTHRIX', -440, -760);
    ctx.restore();
  }

  const rows = [
    { label: 'CALORIES', val: `${calStr} kcal`, y: -510, accent: true },
    { label: 'PROTEIN', val: proStr, y: -170, accent: false },
    { label: 'CARBS', val: carbStr, y: 170, accent: false },
    { label: 'FAT', val: fatStr, y: 510, accent: false },
  ];

  ctx.save();
  ctx.translate(425, 0);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const r of rows) {
    ctx.fillStyle = textColor;
    ctx.save();
    ctx.globalAlpha *= 0.75;
    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.fillText(r.label, -r.y, -30);
    ctx.restore();

    ctx.fillStyle = r.accent ? accentColor : textColor;
    ctx.font = '900 40px "Archivo", sans-serif';
    ctx.fillText(r.val, -r.y, 14);
  }
  ctx.restore();
}

export function renderShareOverlayToCanvas(
  canvas: HTMLCanvasElement,
  params: RenderOverlayParams
): void {
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  // Food sticker mode is strictly transparent-only
  const isTransparent = params.mode === 'food' ? true : Boolean(params.transparentOnly);

  if (!isTransparent) {
    // Background layer for Complete Composite export or Studio Preview
    if (params.mode === 'journey' && params.beforeImg && params.afterImg) {
      drawCoverImage(ctx, params.beforeImg, 0, 0, STORY_WIDTH / 2, STORY_HEIGHT);
      drawCoverImage(ctx, params.afterImg, STORY_WIDTH / 2, 0, STORY_WIDTH / 2, STORY_HEIGHT);
      // Subtle center vertical hairline between Before/After
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillRect(STORY_WIDTH / 2 - 2, 0, 4, STORY_HEIGHT);

      // Subtle dark vignette for legibility
      const grad = ctx.createLinearGradient(0, STORY_HEIGHT * 0.45, 0, STORY_HEIGHT);
      grad.addColorStop(0, 'rgba(9,10,12,0.12)');
      grad.addColorStop(1, 'rgba(9,10,12,0.72)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

      // Clean top labels for Before & After
      ctx.save();
      ctx.font = '700 26px "JetBrains Mono", monospace';
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = 12;
      ctx.textAlign = 'left';
      ctx.fillText('BEFORE', 48, 86);
      ctx.textAlign = 'right';
      ctx.fillText('AFTER', STORY_WIDTH - 48, 86);
      ctx.restore();
    } else if (params.photoImg) {
      drawCoverImage(ctx, params.photoImg, 0, 0, STORY_WIDTH, STORY_HEIGHT);
    } else {
      // Rich dark editorial studio canvas when exporting Complete card without a photo
      const grad = ctx.createLinearGradient(0, 0, STORY_WIDTH, STORY_HEIGHT);
      grad.addColorStop(0, '#090A0C');
      grad.addColorStop(0.55, '#111317');
      grad.addColorStop(1, '#090A0C');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

      // Very subtle architectural radial glow
      const glow = ctx.createRadialGradient(
        STORY_WIDTH * 0.5,
        STORY_HEIGHT * 0.42,
        40,
        STORY_WIDTH * 0.5,
        STORY_HEIGHT * 0.42,
        620
      );
      glow.addColorStop(0, 'rgba(200, 255, 0, 0.10)');
      glow.addColorStop(1, 'rgba(200, 255, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
    }
  }

  // Transform and draw transparent overlay artwork (zero card boxes!)
  ctx.save();
  const centerX = STORY_WIDTH * (0.5 + params.transform.posX);
  const centerY = STORY_HEIGHT * (0.5 + params.transform.posY);
  ctx.translate(centerX, centerY);
  ctx.rotate((params.transform.rotationDeg * Math.PI) / 180);
  ctx.scale(params.transform.scale, params.transform.scale);
  ctx.globalAlpha = Math.max(0.2, Math.min(1, params.transform.opacity));

  // Subtle ambient drop shadow only for crisp separation over photography (never a solid box)
  ctx.shadowColor =
    params.transform.textColor.toLowerCase() === '#090a0c'
      ? 'rgba(255,255,255,0.22)'
      : 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 2;

  if (params.mode === 'food' && params.food) {
    drawFoodStickerOverlay(
      ctx,
      params.foodTemplate || 'single-line',
      params.food,
      params.transform
    );
  } else if (params.mode === 'macros') {
    if (params.macroTemplate === 'classic-circles') {
      drawMacroClassicCircles(ctx, params.macros, params.transform);
    } else if (params.macroTemplate === 'minimal-type') {
      drawMacroMinimalType(ctx, params.macros, params.transform);
    } else if (params.macroTemplate === 'macro-rings') {
      drawMacroRings(ctx, params.macros, params.transform);
    } else {
      drawMacroSportsPerformance(ctx, params.macros, params.transform);
    }
  } else if (params.mode === 'streak') {
    drawStreakOverlay(ctx, params.streakTemplate, params.streak, params.transform);
  } else {
    drawJourneyOverlay(ctx, params.journeyTemplate, params.journey, params.transform);
  }

  ctx.restore();
}

export async function renderOverlayToAssets(
  params: RenderOverlayParams,
  mimeType: 'image/png' | 'image/jpeg' = 'image/png'
): Promise<{ blob: Blob; dataUrl: string }> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready;
    } catch {
      // Proceed cleanly
    }
  }

  const canvas = document.createElement('canvas');
  renderShareOverlayToCanvas(canvas, params);
  const dataUrl = canvas.toDataURL(mimeType, 0.96);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) {
          reject(new Error('Failed to generate image file.'));
          return;
        }
        resolve(b);
      },
      mimeType,
      0.96
    );
  });

  return { blob, dataUrl };
}

export async function renderOverlayToBlob(
  params: RenderOverlayParams,
  mimeType: 'image/png' | 'image/jpeg' = 'image/png'
): Promise<Blob> {
  const { blob } = await renderOverlayToAssets(params, mimeType);
  return blob;
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
