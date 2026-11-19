import { useState, useEffect } from 'react';
import { motion, MotionConfig, type Variants } from 'motion/react';
import { PageLoader } from './components/PageLoader';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { PhilosophySection } from './components/PhilosophySection';
import { ExperienceSection } from './components/ExperienceSection';
import { DualExperienceSection } from './components/DualExperienceSection';
import { FinalStatementSection } from './components/FinalStatementSection';
import { Footer } from './components/Footer';
import { AuthModal, type UserSession } from './components/AuthModal';
import { NutritionApp } from './components/NutritionApp';

const SESSION_STORAGE_KEY = 'calothrix_session_v1';

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

export default function App() {
  const [session, setSession] = useState<UserSession | null>(() => {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as UserSession) : null;
    } catch {
      return null;
    }
  });

  const [view, setView] = useState<'homepage' | 'app'>(() => {
    if (window.location.hash === '#/app') return 'app';
    return 'homepage';
  });

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');
  const [authModalRole, setAuthModalRole] = useState<'member' | 'trainer'>('member');

  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === '#/app' && session) {
        setView('app');
      } else if (window.location.hash !== '#/app') {
        setView('homepage');
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [session]);

  const openAuth = (role: 'member' | 'trainer' = 'member', mode: 'signin' | 'signup' = 'signin') => {
    if (session) {
      setView('app');
      window.location.hash = '#/app';
      return;
    }
    setAuthModalRole(role);
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const handleAuthenticated = (newSession: UserSession) => {
    setSession(newSession);
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
    } catch {
      // ignore storage errors
    }
    setAuthModalOpen(false);
    setView('app');
    window.location.hash = '#/app';
    window.scrollTo({ top: 0 });
  };

  const handleSignOut = () => {
    setSession(null);
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    setView('homepage');
    window.location.hash = '';
    window.scrollTo({ top: 0 });
  };

  const scrollToPhilosophy = () => {
    const target = document.querySelector('#philosophy');
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <MotionConfig reducedMotion="user">
      {view === 'app' && session ? (
        <NutritionApp
          session={session}
          onBackToHomepage={() => {
            setView('homepage');
            window.location.hash = '';
            window.scrollTo({ top: 0 });
          }}
          onSignOut={handleSignOut}
        />
      ) : (
        <div className="min-h-screen overflow-x-clip bg-[#090A0C] text-[#F4F3EF]">
          <PageLoader />

          <Navbar
            onOpenAuth={(role = 'member') => openAuth(role, 'signin')}
            isAuthenticated={Boolean(session)}
            onEnterApp={() => {
              setView('app');
              window.location.hash = '#/app';
              window.scrollTo({ top: 0 });
            }}
          />

          <main>
            <HeroSection
              onExplore={scrollToPhilosophy}
              onGetStarted={() => openAuth('member', 'signup')}
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
              <ExperienceSection onSelectExploreAction={() => openAuth('member', 'signup')} />
            </motion.div>

            <motion.div
              custom={2}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 'some' }}
              variants={sectionRevealVariants}
            >
              <DualExperienceSection
                onIndividualLogin={() => openAuth('member', 'signin')}
                onTrainerLogin={() => openAuth('trainer', 'signin')}
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
                onIndividualLogin={() => openAuth('member', 'signin')}
                onTrainerLogin={() => openAuth('trainer', 'signin')}
              />
            </motion.div>
          </main>

          <Footer onOpenAuth={(role) => openAuth(role, 'signin')} />

          <AuthModal
            open={authModalOpen}
            initialMode={authModalMode}
            initialRole={authModalRole}
            onClose={() => setAuthModalOpen(false)}
            onAuthenticated={handleAuthenticated}
          />
        </div>
      )}
    </MotionConfig>
  );
}
