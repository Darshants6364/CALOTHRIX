import { useRef, useState, useEffect } from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
  type Variants,
} from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { MagneticButton } from './MagneticButton';
import heroAthleteImg from '../../assets/images/calothrix_hero_athlete_1794979415410.jpg';

interface HeroSectionProps {
  onExplore: () => void;
  onGetStarted: () => void;
}

const HERO_WORDS = ['BUILT', 'TO', 'PUSH', 'YOUR', 'LIMITS.'];

const headlineContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.48,
      staggerChildren: 0.09,
    },
  },
};

const headlineWordVariants: Variants = {
  hidden: {
    opacity: 0,
    y: '110%',
  },
  visible: {
    opacity: 1,
    y: '0%',
    transition: {
      duration: 0.75,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

const HERO_STAGE_MODES = [
  {
    id: 'train',
    label: 'Train',
    headline: 'Structured Effort',
    detail: 'Track sessions with intention and align daily training output with recovery.',
    progress: 86,
  },
  {
    id: 'fuel',
    label: 'Fuel',
    headline: 'Targeted Nutrition',
    detail: 'Dial in calories, protein pacing, and daily macro balance without guesswork.',
    progress: 94,
  },
  {
    id: 'track',
    label: 'Track',
    headline: 'Visible Momentum',
    detail: 'Turn daily consistency into clear multi-week progress across individuals and trainers.',
    progress: 91,
  },
];

export function HeroSection({ onExplore, onGetStarted }: HeroSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [imgError, setImgError] = useState(false);
  const [activeStageIdx, setActiveStageIdx] = useState(0);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    if (prefersReduced) return;
    const interval = setInterval(() => {
      setActiveStageIdx((prev) => (prev + 1) % HERO_STAGE_MODES.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [prefersReduced]);

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const smoothPointerX = useSpring(pointerX, { stiffness: 130, damping: 20 });
  const smoothPointerY = useSpring(pointerY, { stiffness: 130, damping: 20 });
  const ringX = useTransform(smoothPointerX, (v) => v * -0.75);
  const ringY = useTransform(smoothPointerY, (v) => v * -0.75);

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (prefersReduced || !sectionRef.current || window.innerWidth < 1024) return;
    const rect = sectionRef.current.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width - 0.5;
    const normY = (e.clientY - rect.top) / rect.height - 0.5;
    pointerX.set(normX * -42);
    pointerY.set(normY * -28);
  };

  const handleMouseLeave = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  const activeStage = HERO_STAGE_MODES[activeStageIdx];

  return (
    <section
      id="top"
      ref={sectionRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative min-h-[92svh] sm:min-h-screen flex flex-col justify-end overflow-hidden bg-[#090A0C] text-[#F4F3EF]"
    >
      {/* Animated Curtain Wipe + Breathing Cinematic Athlete Background */}
      <motion.div
        style={{
          x: smoothPointerX,
          y: smoothPointerY,
        }}
        initial={{ clipPath: 'inset(100% 0% 0% 0%)', scale: 1.15 }}
        animate={{ clipPath: 'inset(0% 0% 0% 0%)', scale: 1.03 }}
        transition={{ duration: 1.1, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute -inset-4 sm:-inset-8 will-change-transform"
      >
        <motion.div
          animate={prefersReduced ? undefined : { scale: [1, 1.05, 1] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
          className="h-full w-full"
        >
          {!imgError ? (
            <img
              src={heroAthleteImg}
              alt="Track athlete in starting stance inside brutalist concrete training hall"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover object-[52%_26%] sm:object-center"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-[#090A0C] via-[#15181F] to-[#090A0C]" />
          )}
        </motion.div>
      </motion.div>

      {/* Measured Editorial Contrast Scrim */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#090A0C] via-[#090A0C]/50 to-[#090A0C]/70"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#090A0C]/88 via-[#090A0C]/35 to-transparent"
      />

      {/* Ambient Rotating Architectural Orbital SVG */}
      {!prefersReduced && (
        <motion.div
          aria-hidden="true"
          style={{ x: ringX, y: ringY }}
          className="pointer-events-none absolute right-[-6%] top-[12%] hidden lg:flex items-center justify-center opacity-35"
        >
          <motion.svg
            width="420"
            height="420"
            viewBox="0 0 420 420"
            fill="none"
            animate={{ rotate: 360 }}
            transition={{ duration: 36, repeat: Infinity, ease: 'linear' }}
          >
            <circle
              cx="210"
              cy="210"
              r="195"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="1"
              strokeDasharray="8 14"
            />
            <circle
              cx="210"
              cy="210"
              r="142"
              stroke="#C8FF00"
              strokeWidth="1.25"
              strokeDasharray="90 220"
              strokeLinecap="round"
            />
          </motion.svg>
        </motion.div>
      )}

      {/* Main Editorial Hero Content */}
      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-28 pb-10 sm:pb-14 lg:pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
          {/* Oversized Skewed Staggered Word-Reveal Headline */}
          <div className="lg:col-span-8">
            <motion.p
              initial={{ opacity: 0, x: -28 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="font-mono text-xs font-medium tracking-[0.2em] uppercase text-[#C8FF00] mb-5"
            >
              CALOTHRIX Performance Platform
            </motion.p>

            <motion.h1
              variants={headlineContainerVariants}
              initial="hidden"
              animate="visible"
              className="font-display text-[clamp(2.85rem,6.6vw,5.75rem)] font-extrabold leading-[0.94] tracking-[-0.03em] text-white text-balance"
            >
              {HERO_WORDS.map((word) => (
                <span key={word} className="inline-block overflow-hidden mr-[0.22em] align-bottom">
                  <motion.span
                    variants={headlineWordVariants}
                    className={`inline-block ${
                      word === 'LIMITS.' ? 'text-[#C8FF00]' : 'text-white'
                    }`}
                  >
                    {word}
                  </motion.span>
                </span>
              ))}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.95, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 text-base sm:text-lg leading-relaxed text-[#E5E4DF] max-w-xl"
            >
              Your fitness journey deserves more than guesswork. Discover a smarter way to train,
              fuel and track your progress.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 1.05, ease: [0.16, 1, 0.3, 1] }}
              className="mt-8 flex flex-wrap items-center gap-3.5"
            >
              <MagneticButton
                onClick={onGetStarted}
                className="group inline-flex min-h-[48px] items-center justify-center gap-2.5 rounded-sm bg-[#C8FF00] px-7 py-3.5 text-xs font-bold tracking-wider uppercase text-[#090A0C] hover:bg-[#D9FF4D] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Get Started
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </MagneticButton>

              <MagneticButton
                onClick={onExplore}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-sm border border-white/30 bg-black/40 px-6 py-3.5 text-xs font-bold tracking-wider uppercase text-white hover:border-[#C8FF00] hover:text-[#C8FF00] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8FF00]"
              >
                Explore CALOTHRIX
              </MagneticButton>
            </motion.div>
          </div>

          {/* Interactive Kinetic Stage Card */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-4 border border-white/15 bg-[#0D0F13]/85 backdrop-blur-md p-6"
          >
            <div className="flex items-center justify-between gap-2 pb-4 border-b border-white/12">
              {HERO_STAGE_MODES.map((mode, idx) => {
                const active = idx === activeStageIdx;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setActiveStageIdx(idx)}
                    className="relative pb-2 text-xs font-bold uppercase tracking-widest transition-colors min-h-[36px]"
                  >
                    <span className={active ? 'text-[#C8FF00]' : 'text-white/50 hover:text-white'}>
                      {mode.label}
                    </span>
                    {active && (
                      <motion.span
                        layoutId="hero-stage-underline"
                        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                        className="absolute inset-x-0 bottom-0 h-[2px] bg-[#C8FF00]"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 min-h-[96px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeStage.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  <p className="font-display text-xl font-bold text-white">
                    {activeStage.headline}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[#B6B8BE]">
                    {activeStage.detail}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Animated Kinetic Bar */}
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="h-[3px] w-full bg-white/10 overflow-hidden">
                <motion.div
                  key={activeStage.id}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: activeStage.progress / 100 }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full w-full origin-left bg-[#C8FF00]"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
