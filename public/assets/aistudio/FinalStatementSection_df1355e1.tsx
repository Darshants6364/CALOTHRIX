import { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { MagneticButton } from './MagneticButton';
import ctaAtmosphereImg from '../assets/images/macrolog_cta_atmosphere_1794978502209.jpg';

interface FinalStatementSectionProps {
  onIndividualLogin: () => void;
  onTrainerLogin: () => void;
}

export function FinalStatementSection({
  onIndividualLogin,
  onTrainerLogin,
}: FinalStatementSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [imgError, setImgError] = useState(false);
  const prefersReduced = useReducedMotion();

  // Interactive cursor spotlight
  const spotX = useMotionValue(50);
  const spotY = useMotionValue(50);
  const smoothSpotX = useSpring(spotX, { stiffness: 140, damping: 24 });
  const smoothSpotY = useSpring(spotY, { stiffness: 140, damping: 24 });
  const spotlightGradient = useTransform(
    [smoothSpotX, smoothSpotY],
    ([x, y]) =>
      `radial-gradient(540px circle at ${x}% ${y}%, rgba(200, 255, 0, 0.16), transparent 70%)`
  );

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (prefersReduced || !sectionRef.current) return;
    const rect = sectionRef.current.getBoundingClientRect();
    spotX.set(((e.clientX - rect.left) / rect.width) * 100);
    spotY.set(((e.clientY - rect.top) / rect.height) * 100);
  };

  return (
    <section
      ref={sectionRef}
      onMouseMove={handleMouseMove}
      className="relative overflow-hidden bg-[#090A0C] text-white py-28 sm:py-36"
    >
      {!imgError && (
        <motion.img
          src={ctaAtmosphereImg}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          animate={prefersReduced ? undefined : { scale: [1, 1.07, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-35"
        />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#090A0C] via-[#090A0C]/70 to-[#090A0C]/85"
      />

      {!prefersReduced && (
        <motion.div
          aria-hidden="true"
          style={{ background: spotlightGradient }}
          className="pointer-events-none absolute inset-0"
        />
      )}

      <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 'some' }}
          transition={{ duration: 0.55 }}
          className="font-mono text-xs tracking-[0.2em] uppercase text-[#C8FF00]"
        >
          CALOTHRIX · Ready When You Are
        </motion.p>

        <motion.h2
          initial={{ opacity: 0, scale: 0.88, y: 40 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, amount: 'some' }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 font-display text-[clamp(2.5rem,5.6vw,4.85rem)] font-extrabold leading-[0.96] tracking-[-0.03em] text-white text-balance will-change-transform"
        >
          YOUR NEXT LEVEL STARTS HERE.
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 'some' }}
          transition={{ duration: 0.65, delay: 0.14 }}
          className="mt-6 text-base sm:text-xl text-[#D4D3CE] max-w-xl mx-auto leading-relaxed"
        >
          Move with purpose. Stay consistent. Become stronger.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 'some' }}
          transition={{ duration: 0.65, delay: 0.22 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <MagneticButton
            onClick={onIndividualLogin}
            className="group inline-flex min-h-[48px] items-center justify-center gap-2.5 rounded-sm bg-[#C8FF00] px-7 py-3.5 text-xs font-bold tracking-[0.12em] uppercase text-[#090A0C] hover:bg-[#D9FF4D] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Individual Login
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </MagneticButton>

          <MagneticButton
            onClick={onTrainerLogin}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-sm border border-white/30 bg-black/40 px-7 py-3.5 text-xs font-bold tracking-[0.12em] uppercase text-white hover:border-[#C8FF00] hover:text-[#C8FF00] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8FF00]"
          >
            Trainer Login
          </MagneticButton>
        </motion.div>
      </div>
    </section>
  );
}
