import { useRef, useState } from 'react';
import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
} from 'motion/react';
import philosophyFormImg from '../../assets/images/calothrix_philosophy_form_1794979415734.jpg';

export function PhilosophySection() {
  const leftColRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [imgError, setImgError] = useState(false);
  const prefersReduced = useReducedMotion();
  const isTextInView = useInView(leftColRef, { once: true, amount: 'some' });
  const showText = Boolean(isTextInView || prefersReduced);

  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const smoothTiltX = useSpring(tiltX, { stiffness: 180, damping: 20 });
  const smoothTiltY = useSpring(tiltY, { stiffness: 180, damping: 20 });
  const rotateY = useTransform(smoothTiltX, [-0.5, 0.5], [-8, 8]);
  const rotateX = useTransform(smoothTiltY, [-0.5, 0.5], [8, -8]);

  const handleCardMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (prefersReduced || !cardRef.current || window.innerWidth < 1024) return;
    const rect = cardRef.current.getBoundingClientRect();
    tiltX.set((e.clientX - rect.left) / rect.width - 0.5);
    tiltY.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleCardLeave = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  return (
    <section
      id="philosophy"
      className="relative overflow-hidden bg-[#F4F3EF] text-[#090A0C] pt-24 sm:pt-32"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-20 sm:pb-28">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          {/* Left: Bold Choreographed Editorial Statement */}
          <div ref={leftColRef} className="lg:col-span-7">
            <motion.p
              initial={{ opacity: 0, x: -32 }}
              animate={showText ? { opacity: 1, x: 0 } : { opacity: 0, x: -32 }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
              className="font-mono text-xs tracking-widest uppercase text-[#52555E] mb-8"
            >
              01 · Brand Philosophy
            </motion.p>

            <h2 className="font-display text-[clamp(2.25rem,4.9vw,4.35rem)] font-extrabold leading-[0.97] tracking-[-0.03em] text-[#090A0C] text-balance">
              {[
                { text: "FITNESS ISN'T JUST", delay: 0.05 },
                { text: 'WHAT YOU DO.', delay: 0.16 },
                { text: "IT'S WHO YOU BECOME.", delay: 0.27 },
              ].map((line) => (
                <span key={line.text} className="block overflow-hidden">
                  <motion.span
                    initial={{ y: '100%', skewY: 3, opacity: 0 }}
                    animate={
                      showText
                        ? { y: '0%', skewY: 0, opacity: 1 }
                        : { y: '100%', skewY: 3, opacity: 0 }
                    }
                    transition={{
                      duration: 0.78,
                      delay: line.delay,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="block"
                  >
                    {line.text}
                  </motion.span>
                </span>
              ))}
            </h2>

            <motion.div
              initial={{ opacity: 0, y: 36 }}
              animate={showText ? { opacity: 1, y: 0 } : { opacity: 0, y: 36 }}
              transition={{ duration: 0.75, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="mt-10 sm:mt-14 grid grid-cols-1 sm:grid-cols-2 gap-8 border-t border-black/15 pt-8"
            >
              <p className="text-base leading-relaxed text-[#24262B]">
                CALOTHRIX brings fitness, nutrition, and progress tracking together in one unified
                experience—built for clarity when training hard and precision when fueling daily.
              </p>
              <p className="text-base leading-relaxed text-[#52555E]">
                No disconnected spreadsheets. No cluttered noise. Just deliberate structure connecting
                the work you put in with the person you are becoming.
              </p>
            </motion.div>
          </div>

          {/* Right: 3D Perspective Tilt + Dramatic Shutter Wipe Portrait */}
          <div className="lg:col-span-5" style={{ perspective: '1100px' }}>
            <motion.div
              ref={cardRef}
              onMouseMove={handleCardMove}
              onMouseLeave={handleCardLeave}
              style={prefersReduced ? undefined : { rotateX, rotateY }}
              initial={{ clipPath: 'inset(100% 0% 0% 0%)', scale: 1.15 }}
              whileInView={{ clipPath: 'inset(0% 0% 0% 0%)', scale: 1 }}
              viewport={{ once: true, amount: 'some' }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className="relative overflow-hidden bg-[#16181D] aspect-[4/5] sm:aspect-[3/4] shadow-2xl shadow-black/15 will-change-transform"
            >
              {!imgError ? (
                <img
                  src={philosophyFormImg}
                  alt="Athlete recovering between sets in sunlit architectural studio"
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="h-full w-full object-cover object-top"
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-b from-[#1E2026] to-[#090A0C]" />
              )}
            </motion.div>

            <div className="mt-4 flex items-center justify-between text-xs text-[#52555E] font-mono">
              <span>DISCIPLINE · CONSISTENCY · OUTPUT</span>
              <span>CALOTHRIX</span>
            </div>
          </div>
        </div>
      </div>

      {/* Continuous Smooth Kinetic Marquee Divider */}
      <div className="overflow-hidden border-t border-b border-black/15 bg-[#EAE8E1] py-4">
        <div className="flex w-max animate-calothrix-marquee whitespace-nowrap">
          {[0, 1, 2, 3].map((dup) => (
            <div
              key={dup}
              className="flex items-center gap-8 pr-8 font-display text-xs sm:text-sm font-extrabold tracking-[0.22em] uppercase text-[#090A0C]"
            >
              <span>Train With Purpose</span>
              <span aria-hidden="true" className="text-[#52555E]">
                /
              </span>
              <span>Fuel Your Body</span>
              <span aria-hidden="true" className="text-[#52555E]">
                /
              </span>
              <span>Track Your Progress</span>
              <span aria-hidden="true" className="text-[#52555E]">
                /
              </span>
              <span>Become Stronger Every Day</span>
              <span aria-hidden="true" className="text-[#52555E]">
                /
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
