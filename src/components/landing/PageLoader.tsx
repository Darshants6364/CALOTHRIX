import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { CalothrixLogo } from '../CalothrixLogo';

export function PageLoader() {
  const prefersReduced = useReducedMotion();
  const [visible, setVisible] = useState(!prefersReduced);

  useEffect(() => {
    if (prefersReduced) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(false), 950);
    return () => clearTimeout(timer);
  }, [prefersReduced]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          aria-hidden="true"
          onClick={() => setVisible(false)}
          initial={{ clipPath: 'inset(0% 0% 0% 0%)' }}
          exit={{ clipPath: 'inset(0% 0% 100% 0%)' }}
          transition={{ duration: 0.72, ease: [0.76, 0, 0.24, 1] }}
          className="dark fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#090A0C] text-[#F4F3EF] cursor-pointer"
        >
          <div className="flex flex-col items-center gap-5">
            <div className="overflow-hidden">
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: '0%' }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center"
              >
                <CalothrixLogo size="md" />
              </motion.div>
            </div>
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.65, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="h-[2px] w-48 origin-left bg-[#C8FF00]"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
