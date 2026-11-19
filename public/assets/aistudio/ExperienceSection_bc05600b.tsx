import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import { MagneticButton } from './MagneticButton';
import themeNutritionImg from '../assets/images/calothrix_theme_nutrition_1794979415342.jpg';
import themeStudioImg from '../assets/images/macrolog_philosophy_studio_1794978501289.jpg';
import themeTrainingImg from '../assets/images/calothrix_theme_training_1794979416138.jpg';
import themeAtmosphereImg from '../assets/images/macrolog_cta_atmosphere_1794978502209.jpg';

interface ThemeItem {
  id: string;
  num: string;
  title: string;
  availability: 'Live Now' | 'Upcoming';
  subtitle: string;
  caption: string;
  image: string;
  imgClass: string;
  alt: string;
  interactiveModes: { label: string; metric: string; pct: number; note: string }[];
}

const THEMES: ThemeItem[] = [
  {
    id: 'nutrition',
    num: '01',
    title: 'NUTRITION',
    availability: 'Live Now',
    subtitle: 'Understand what fuels your body.',
    caption:
      'Macro tracking is live today—calories, protein pacing, carbohydrates, and fats logged without spreadsheet friction.',
    image: themeNutritionImg,
    imgClass: 'object-center',
    alt: 'Editorial still life of performance nutrition meal and digital kitchen scale on dark slate',
    interactiveModes: [
      {
        label: 'Training Day',
        metric: '2,650 kcal · 185g P · 310g C',
        pct: 92,
        note: 'Higher carbohydrate allocation around heavy output.',
      },
      {
        label: 'Recovery Day',
        metric: '2,200 kcal · 185g P · 190g C',
        pct: 76,
        note: 'Steady protein floor with controlled energy balance.',
      },
    ],
  },
  {
    id: 'tracking',
    num: '02',
    title: 'WEIGHT & TRACKING',
    availability: 'Live Now',
    subtitle: 'Stay aware of your daily progress.',
    caption:
      'Body weight logging and daily macro check-ins work together right now to keep your trend clear.',
    image: themeStudioImg,
    imgClass: 'object-[70%_35%] sm:object-center',
    alt: 'Athlete preparing in sunlit concrete and steel training studio',
    interactiveModes: [
      {
        label: 'Daily Log',
        metric: '74.2 kg · 142g Protein Logged',
        pct: 79,
        note: 'Track daily weight alongside remaining macro targets.',
      },
      {
        label: 'Weekly Rhythm',
        metric: '6 / 7 Days Logged · -0.3 kg/wk',
        pct: 88,
        note: 'Spot real body weight trends across weekdays and weekends.',
      },
    ],
  },
  {
    id: 'performance',
    num: '03',
    title: 'PERFORMANCE',
    availability: 'Upcoming',
    subtitle: 'Build consistency and improve.',
    caption:
      'Upcoming training module—structured workouts, session volume, and load progression connected to your fuel.',
    image: themeTrainingImg,
    imgClass: 'object-center',
    alt: 'Chalk-dusted hands gripping a knurled black steel Olympic barbell',
    interactiveModes: [
      {
        label: 'Strength Block',
        metric: 'Upcoming · Compound Focus',
        pct: 90,
        note: 'Planned workout logging paired with daily macro targets.',
      },
      {
        label: 'Conditioning',
        metric: 'Upcoming · Aerobic & Threshold',
        pct: 84,
        note: 'Planned endurance sessions aligned with carbohydrate intake.',
      },
    ],
  },
  {
    id: 'progress',
    num: '04',
    title: 'PROGRESS',
    availability: 'Upcoming',
    subtitle: "See how far you've come.",
    caption:
      'Expanding multi-week analytics and trainer client insights connecting nutrition, weight, and training output.',
    image: themeAtmosphereImg,
    imgClass: 'object-center',
    alt: 'Minimalist concrete athletic pavilion and running track at pre-dawn twilight',
    interactiveModes: [
      {
        label: '4-Week Horizon',
        metric: 'Weight Trend Active · Analytics Expanding',
        pct: 82,
        note: 'Follow rolling weight changes alongside daily consistency.',
      },
      {
        label: 'Trainer Sync',
        metric: 'Upcoming · Client Coaching View',
        pct: 95,
        note: 'Share nutrition and weight progress directly with your coach.',
      },
    ],
  },
];

interface ExperienceSectionProps {
  onSelectExploreAction: () => void;
}

export function ExperienceSection({ onSelectExploreAction }: ExperienceSectionProps) {
  const [activeId, setActiveId] = useState<string>(THEMES[0].id);
  const [modeIndices, setModeIndices] = useState<Record<string, number>>({
    nutrition: 0,
    tracking: 0,
    performance: 0,
    progress: 0,
  });
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const activeTheme = THEMES.find((t) => t.id === activeId) ?? THEMES[0];
  const activeModeIdx = modeIndices[activeTheme.id] ?? 0;
  const activeMode = activeTheme.interactiveModes[activeModeIdx];

  return (
    <section
      id="experience"
      className="bg-[#090A0C] text-[#F4F3EF] py-20 sm:py-32 border-b border-white/[0.1]"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 'some' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-10 sm:pb-12 border-b border-white/[0.12]"
        >
          <div>
            <p className="font-mono text-xs tracking-widest uppercase text-[#C8FF00]">
              02 · The CALOTHRIX Experience
            </p>
            <h2 className="mt-3 font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-white text-balance">
              FOUR PILLARS OF MOMENTUM.
            </h2>
          </div>
          <p className="text-sm sm:text-base text-[#9A9CA3] max-w-md leading-relaxed">
            Macro tracking and body weight tracking are live today on the web app. Training and
            coaching analytics expand next.
          </p>
        </motion.div>

        {/* Asymmetrical Editorial Showcase */}
        <div className="mt-10 sm:mt-12 grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Left: Interactive Editorial Typographic List */}
          <div className="lg:col-span-7 divide-y divide-white/[0.12] border-b border-white/[0.12]">
            {THEMES.map((theme, idx) => {
              const isActive = theme.id === activeId;
              const currentModeIdx = modeIndices[theme.id] ?? 0;

              return (
                <motion.div
                  key={theme.id}
                  initial={{ opacity: 0, x: -28 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 'some' }}
                  transition={{ duration: 0.6, delay: idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
                  className="relative py-6 sm:py-9 pl-4 sm:pl-5"
                >
                  {/* Sliding layoutId Active Accent Bar */}
                  {isActive && (
                    <motion.div
                      layoutId="experience-active-bar"
                      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                      className="absolute left-0 top-5 bottom-5 w-[3px] bg-[#C8FF00]"
                    />
                  )}

                  <button
                    type="button"
                    onMouseEnter={() => setActiveId(theme.id)}
                    onFocus={() => setActiveId(theme.id)}
                    onClick={() => setActiveId(theme.id)}
                    className="group w-full text-left transition-colors focus-visible:outline-none"
                  >
                    <div className="flex items-baseline justify-between gap-4 sm:gap-6">
                      <div className="flex items-baseline gap-3 sm:gap-7 min-w-0">
                        <span
                          className={`font-mono text-xs tabular-nums transition-colors shrink-0 ${
                            isActive ? 'text-[#C8FF00]' : 'text-white/40 group-hover:text-white/75'
                          }`}
                        >
                          {theme.num}
                        </span>
                        <motion.span
                          animate={{ x: isActive ? 10 : 0 }}
                          transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                          className={`origin-left font-display text-2xl sm:text-5xl font-extrabold tracking-[-0.03em] transition-colors duration-200 ${
                            isActive ? 'text-[#C8FF00]' : 'text-white/80 group-hover:text-white'
                          }`}
                        >
                          {theme.title}
                        </motion.span>
                      </div>

                      <motion.span
                        animate={{
                          rotate: isActive ? 0 : -45,
                          opacity: isActive ? 1 : 0.45,
                        }}
                        transition={{ type: 'spring', stiffness: 280, damping: 20 }}
                        className="shrink-0"
                      >
                        <ArrowUpRight
                          aria-hidden="true"
                          className={`h-5 w-5 ${
                            isActive ? 'text-[#C8FF00]' : 'text-white/40 group-hover:text-white'
                          }`}
                        />
                      </motion.span>
                    </div>

                    <div className="mt-2.5 pl-7 sm:pl-11 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p
                        className={`text-base sm:text-lg font-medium transition-colors ${
                          isActive ? 'text-white' : 'text-white/60'
                        }`}
                      >
                        {theme.subtitle}
                      </p>
                      <span
                        className={`font-mono text-[11px] uppercase tracking-wider ${
                          theme.availability === 'Live Now' ? 'text-[#C8FF00]' : 'text-white/45'
                        }`}
                      >
                        · {theme.availability}
                      </span>
                    </div>
                  </button>

                  {/* Interactive Expandable Drawer Inside Active Row */}
                  <AnimatePresence initial={false}>
                    {isActive && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden pl-7 sm:pl-11"
                      >
                        <div className="pt-4 space-y-4">
                          {/* Mobile & Tablet Inline Photographic Preview (Aligned cleanly on narrow screens) */}
                          <div className="lg:hidden relative aspect-[16/10] w-full overflow-hidden bg-[#14161C] rounded-sm">
                            {!failedImages[theme.id] ? (
                              <img
                                src={theme.image}
                                alt={theme.alt}
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setFailedImages((prev) => ({ ...prev, [theme.id]: true }))
                                }
                                className={`h-full w-full object-cover ${theme.imgClass}`}
                              />
                            ) : (
                              <div className="h-full w-full bg-gradient-to-br from-[#161920] to-[#090A0C]" />
                            )}
                          </div>

                          <p className="text-sm text-[#9A9CA3] max-w-lg leading-relaxed">
                            {theme.caption}
                          </p>

                          <div className="flex flex-wrap items-center gap-2">
                            {theme.interactiveModes.map((m, mIdx) => {
                              const selected = currentModeIdx === mIdx;
                              return (
                                <button
                                  key={m.label}
                                  type="button"
                                  onClick={() =>
                                    setModeIndices((prev) => ({ ...prev, [theme.id]: mIdx }))
                                  }
                                  className={`min-h-[36px] px-3.5 py-1.5 text-xs font-medium rounded-sm border transition-colors ${
                                    selected
                                      ? 'border-[#C8FF00] bg-[#C8FF00] text-[#090A0C] font-bold'
                                      : 'border-white/15 text-white/75 hover:border-white/40 hover:text-white'
                                  }`}
                                >
                                  {m.label}
                                </button>
                              );
                            })}
                          </div>

                          <motion.div
                            key={`${theme.id}-${currentModeIdx}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25 }}
                            className="border-t border-white/10 pt-3 space-y-2.5"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <p className="font-mono text-xs text-[#C8FF00] tabular-nums">
                                {activeMode.metric}
                              </p>
                              <span className="font-mono text-xs text-white/60 tabular-nums">
                                {activeMode.pct}%
                              </span>
                            </div>
                            <div className="h-1 w-full bg-white/10 overflow-hidden">
                              <motion.div
                                initial={{ scaleX: 0 }}
                                animate={{ scaleX: activeMode.pct / 100 }}
                                transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                                className="h-full w-full origin-left bg-[#C8FF00]"
                              />
                            </div>
                            <p className="text-xs text-white/75">{activeMode.note}</p>
                          </motion.div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>

          {/* Right: Desktop Sticky Photographic Frame */}
          <div className="hidden lg:block lg:col-span-5 lg:sticky lg:top-28">
            <div className="relative aspect-[4/3] overflow-hidden bg-[#14161C] shadow-2xl shadow-black/50">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTheme.id}
                  initial={{
                    clipPath: 'inset(0% 0% 100% 0%)',
                    scale: 1.18,
                  }}
                  animate={{
                    clipPath: 'inset(0% 0% 0% 0%)',
                    scale: 1,
                  }}
                  exit={{
                    clipPath: 'inset(100% 0% 0% 0%)',
                    scale: 1.05,
                  }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0 will-change-[clip-path,transform]"
                >
                  {!failedImages[activeTheme.id] ? (
                    <img
                      src={activeTheme.image}
                      alt={activeTheme.alt}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedImages((prev) => ({ ...prev, [activeTheme.id]: true }))
                      }
                      className={`h-full w-full object-cover ${activeTheme.imgClass}`}
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-[#161920] to-[#090A0C]" />
                  )}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#090A0C]/90 via-transparent to-transparent"
                  />
                </motion.div>
              </AnimatePresence>

              <div className="absolute inset-x-0 bottom-0 p-6 flex items-end justify-between gap-4 z-10">
                <div>
                  <span className="font-mono text-xs text-[#C8FF00] block">
                    {activeTheme.num} / {activeTheme.title} · {activeTheme.availability}
                  </span>
                  <p className="mt-1 text-sm font-medium text-white">{activeTheme.subtitle}</p>
                </div>
                <MagneticButton
                  onClick={onSelectExploreAction}
                  className="shrink-0 rounded-sm bg-[#C8FF00] px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-[#090A0C] hover:bg-[#D9FF4D] transition-colors"
                >
                  Start
                </MagneticButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
