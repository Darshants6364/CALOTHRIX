import { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { MagneticButton } from './MagneticButton';
import studioAthleteImg from '../../assets/images/macrolog_philosophy_studio_1794978501289.jpg';
import trainersCoachImg from '../../assets/images/calothrix_trainers_coach_1794979416975.jpg';

interface DualExperienceSectionProps {
  onIndividualLogin: () => void;
  onTrainerLogin: () => void;
}

export function DualExperienceSection({
  onIndividualLogin,
  onTrainerLogin,
}: DualExperienceSectionProps) {
  const [indImgError, setIndImgError] = useState(false);
  const [trainerImgError, setTrainerImgError] = useState(false);
  const prefersReduced = useReducedMotion();

  const indCardRef = useRef<HTMLDivElement | null>(null);
  const indTiltX = useMotionValue(0);
  const indTiltY = useMotionValue(0);
  const indSmoothX = useSpring(indTiltX, { stiffness: 180, damping: 20 });
  const indSmoothY = useSpring(indTiltY, { stiffness: 180, damping: 20 });
  const indRotateY = useTransform(indSmoothX, [-0.5, 0.5], [-7, 7]);
  const indRotateX = useTransform(indSmoothY, [-0.5, 0.5], [7, -7]);

  const trCardRef = useRef<HTMLDivElement | null>(null);
  const trTiltX = useMotionValue(0);
  const trTiltY = useMotionValue(0);
  const trSmoothX = useSpring(trTiltX, { stiffness: 180, damping: 20 });
  const trSmoothY = useSpring(trTiltY, { stiffness: 180, damping: 20 });
  const trRotateY = useTransform(trSmoothX, [-0.5, 0.5], [-7, 7]);
  const trRotateX = useTransform(trSmoothY, [-0.5, 0.5], [7, -7]);

  const handleTilt = (
    e: React.MouseEvent<HTMLDivElement>,
    ref: React.RefObject<HTMLDivElement | null>,
    xVal: ReturnType<typeof useMotionValue<number>>,
    yVal: ReturnType<typeof useMotionValue<number>>
  ) => {
    if (prefersReduced || !ref.current || window.innerWidth < 1024) return;
    const rect = ref.current.getBoundingClientRect();
    xVal.set((e.clientX - rect.left) / rect.width - 0.5);
    yVal.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  return (
    <div>
      {/* 01 — FOR INDIVIDUALS (Warm Stone Off-White Canvas) */}
      <section
        id="individuals"
        className="overflow-hidden bg-[#F4F3EF] text-[#090A0C] py-24 sm:py-32 border-b border-black/15"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            {/* Editorial Copy Left */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 'some' }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-5"
            >
              <p className="font-mono text-xs tracking-widest uppercase text-[#52555E]">
                01 — For Individuals
              </p>

              <h2 className="mt-4 font-display text-[clamp(2.25rem,4.5vw,3.75rem)] font-extrabold leading-[0.98] tracking-[-0.03em] text-[#090A0C] text-balance">
                YOUR JOURNEY. YOUR PROGRESS.
              </h2>

              <p className="mt-6 text-base sm:text-lg leading-relaxed text-[#2F3238]">
                Take control of your nutrition, understand your daily targets and build habits that
                move you closer to your goals.
              </p>

              <div className="mt-9">
                <MagneticButton
                  onClick={onIndividualLogin}
                  className="group inline-flex min-h-[48px] items-center justify-center gap-3 rounded-sm bg-[#090A0C] px-7 py-3.5 text-xs font-bold tracking-[0.12em] uppercase text-[#C8FF00] hover:bg-[#1C1F26] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#090A0C]"
                >
                  Individual Login
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </MagneticButton>
              </div>
            </motion.div>

            {/* Dramatic Curtain Wipe + Interactive 3D Tilt Right */}
            <div className="lg:col-span-7" style={{ perspective: '1200px' }}>
              <motion.div
                ref={indCardRef}
                onClick={onIndividualLogin}
                onMouseMove={(e) => handleTilt(e, indCardRef, indTiltX, indTiltY)}
                onMouseLeave={() => {
                  indTiltX.set(0);
                  indTiltY.set(0);
                }}
                style={prefersReduced ? undefined : { rotateX: indRotateX, rotateY: indRotateY }}
                initial={{ clipPath: 'inset(0% 100% 0% 0%)', scale: 1.14 }}
                whileInView={{ clipPath: 'inset(0% 0% 0% 0%)', scale: 1 }}
                viewport={{ once: true, amount: 'some' }}
                transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                className="group relative aspect-[4/3] overflow-hidden bg-[#16181D] cursor-pointer shadow-2xl shadow-black/15 will-change-transform"
              >
                {!indImgError ? (
                  <img
                    src={studioAthleteImg}
                    alt="Individual athlete preparing in minimalist training studio"
                    referrerPolicy="no-referrer"
                    onError={() => setIndImgError(true)}
                    className="h-full w-full object-cover object-[70%_35%] sm:object-center transition-transform duration-700 group-hover:scale-105"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-[#23262F] to-[#090A0C]" />
                )}
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* 02 — FOR FITNESS TRAINERS (Deep Charcoal Contrast Canvas) */}
      <section
        id="trainers"
        className="overflow-hidden bg-[#111317] text-[#F4F3EF] py-24 sm:py-32 border-b border-white/[0.1]"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            {/* Dramatic Curtain Wipe + Interactive 3D Tilt Left */}
            <div className="lg:col-span-7 order-2 lg:order-1" style={{ perspective: '1200px' }}>
              <motion.div
                ref={trCardRef}
                onClick={onTrainerLogin}
                onMouseMove={(e) => handleTilt(e, trCardRef, trTiltX, trTiltY)}
                onMouseLeave={() => {
                  trTiltX.set(0);
                  trTiltY.set(0);
                }}
                style={prefersReduced ? undefined : { rotateX: trRotateX, rotateY: trRotateY }}
                initial={{ clipPath: 'inset(0% 0% 0% 100%)', scale: 1.14 }}
                whileInView={{ clipPath: 'inset(0% 0% 0% 0%)', scale: 1 }}
                viewport={{ once: true, amount: 'some' }}
                transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                className="group relative aspect-[4/3] overflow-hidden bg-[#090A0C] cursor-pointer shadow-2xl shadow-black/50 will-change-transform"
              >
                {!trainerImgError ? (
                  <img
                    src={trainersCoachImg}
                    alt="Strength and conditioning coach timing an athlete in dark performance studio"
                    referrerPolicy="no-referrer"
                    onError={() => setTrainerImgError(true)}
                    className="h-full w-full object-cover object-[50%_20%] transition-transform duration-700 group-hover:scale-105"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-[#191C24] to-[#090A0C]" />
                )}
              </motion.div>
            </div>

            {/* Editorial Copy Right */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 'some' }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-5 order-1 lg:order-2"
            >
              <p className="font-mono text-xs tracking-widest uppercase text-[#C8FF00]">
                02 — For Fitness Trainers
              </p>

              <h2 className="mt-4 font-display text-[clamp(2.25rem,4.5vw,3.75rem)] font-extrabold leading-[0.98] tracking-[-0.03em] text-white text-balance">
                LEAD. COACH. TRANSFORM.
              </h2>

              <p className="mt-6 text-base sm:text-lg leading-relaxed text-[#C6C7CC]">
                Manage your clients, monitor their nutrition and support their fitness journeys
                through one connected platform.
              </p>

              <div className="mt-9">
                <MagneticButton
                  onClick={onTrainerLogin}
                  className="group inline-flex min-h-[48px] items-center justify-center gap-3 rounded-sm bg-[#C8FF00] px-7 py-3.5 text-xs font-bold tracking-[0.12em] uppercase text-[#090A0C] hover:bg-[#D9FF4D] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Trainer Login
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </MagneticButton>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}
