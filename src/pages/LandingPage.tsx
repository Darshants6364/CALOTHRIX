import React from 'react';
import { motion, MotionConfig, type Variants } from 'motion/react';
import { PageLoader } from '../components/landing/PageLoader';
import { Navbar } from '../components/landing/Navbar';
import { HeroSection } from '../components/landing/HeroSection';
import { PhilosophySection } from '../components/landing/PhilosophySection';
import { ExperienceSection } from '../components/landing/ExperienceSection';
import { DualExperienceSection } from '../components/landing/DualExperienceSection';
import { FinalStatementSection } from '../components/landing/FinalStatementSection';
import { Footer } from '../components/landing/Footer';
import { AccountRole } from '../types';

interface LandingPageProps {
  onSelectAuth: (role: AccountRole) => void;
}

const sectionRevealVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 44,
  },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.75,
      delay: Math.min(index * 0.08, 0.24),
      ease: [0.16, 1, 0.3, 1],
    },
  }),
};

export const LandingPage: React.FC<LandingPageProps> = ({ onSelectAuth }) => {
  const scrollToPhilosophy = () => {
    const target = document.querySelector('#philosophy');
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="dark min-h-screen overflow-x-clip bg-[#090A0C] text-[#F4F3EF]">
        <PageLoader />

        <Navbar onOpenAuth={onSelectAuth} />

        <main>
          <HeroSection
            onExplore={scrollToPhilosophy}
            onGetStarted={() => onSelectAuth('individual')}
          />

          <motion.div
            custom={0}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 'some' }}
            variants={sectionRevealVariants}
          >
            <PhilosophySection />
          </motion.div>

          <motion.div
            custom={1}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 'some' }}
            variants={sectionRevealVariants}
          >
            <ExperienceSection onSelectExploreAction={() => onSelectAuth('individual')} />
          </motion.div>

          <motion.div
            custom={2}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 'some' }}
            variants={sectionRevealVariants}
          >
            <DualExperienceSection
              onIndividualLogin={() => onSelectAuth('individual')}
              onTrainerLogin={() => onSelectAuth('trainer')}
            />
          </motion.div>

          <motion.div
            custom={3}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 'some' }}
            variants={sectionRevealVariants}
          >
            <FinalStatementSection
              onIndividualLogin={() => onSelectAuth('individual')}
              onTrainerLogin={() => onSelectAuth('trainer')}
            />
          </motion.div>
        </main>

        <Footer onOpenAuth={onSelectAuth} />
      </div>
    </MotionConfig>
  );
};
