import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, X, ChevronDown, ArrowRight, Users } from 'lucide-react';
import { CalothrixLogo } from '../CalothrixLogo';
import { MagneticButton } from './MagneticButton';
import { AccountRole } from '../../types';

interface NavbarProps {
  onOpenAuth: (role: AccountRole) => void;
}

const NAV_LINKS = [
  { num: '01', label: 'Our Philosophy', href: '#philosophy' },
  { num: '02', label: 'Experience', href: '#experience' },
  { num: '03', label: 'Individuals', href: '#individuals' },
  { num: '04', label: 'Trainers', href: '#trainers' },
];

export function Navbar({ onOpenAuth }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginMenuOpen, setLoginMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 36);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!loginMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLoginMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loginMenuOpen]);

  const scrollToTarget = (href: string) => {
    setMobileMenuOpen(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <header
        className={`dark fixed top-0 inset-x-0 z-40 transition-all duration-300 ${
          scrolled
            ? 'bg-[#090A0C]/92 backdrop-blur-md border-b border-white/[0.1]'
            : 'bg-transparent border-b border-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 sm:h-20 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          {/* Zone 1: Default CALOTHRIX Logo */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            aria-label="CALOTHRIX Home"
            className="group inline-flex items-center whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8FF00] rounded py-1 min-h-[44px]"
          >
            <CalothrixLogo size="sm" />
          </a>

          {/* Zone 2: Minimal Editorial Navigation Links with kinetic roll hover */}
          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToTarget(link.href);
                }}
                className="group relative overflow-hidden py-1 text-sm font-medium text-white/80 hover:text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8FF00] rounded"
              >
                <span className="block transition-transform duration-200 ease-out group-hover:-translate-y-full">
                  {link.label}
                </span>
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-full block text-[#C8FF00] transition-transform duration-200 ease-out group-hover:-translate-y-full"
                >
                  {link.label}
                </span>
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-[1.5px] origin-left scale-x-0 bg-[#C8FF00] transition-transform duration-200 group-hover:scale-x-100"
                />
              </a>
            ))}
          </nav>

          {/* Zone 3: Magnetic Login Dropdown connecting Individual Login & Trainer Login */}
          <div className="hidden md:block relative shrink-0">
            <MagneticButton
              onClick={() => setLoginMenuOpen((v) => !v)}
              ariaLabel="Open login portal selection"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-sm border border-white/25 bg-white/[0.04] px-5 py-2 text-xs font-bold tracking-wider uppercase text-white hover:border-[#C8FF00] hover:bg-[#C8FF00] hover:text-[#090A0C] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8FF00]"
            >
              <span>Login</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                  loginMenuOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </MagneticButton>

            <AnimatePresence>
              {loginMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setLoginMenuOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.97 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    role="menu"
                    className="absolute right-0 mt-2 w-60 z-50 border border-white/15 bg-[#0D0F13] shadow-2xl p-1.5 space-y-1 rounded-sm"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setLoginMenuOpen(false);
                        onOpenAuth('individual');
                      }}
                      className="w-full min-h-[46px] px-3.5 py-2.5 text-left hover:bg-[#C8FF00] text-white hover:text-[#090A0C] transition-colors flex items-center justify-between group rounded-sm"
                    >
                      <div>
                        <div className="text-xs font-bold uppercase tracking-[0.12em]">
                          Individual Login
                        </div>
                        <div className="text-[11px] text-[#9A9CA3] group-hover:text-[#090A0C]/75">
                          Personal tracker &amp; diary
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setLoginMenuOpen(false);
                        onOpenAuth('trainer');
                      }}
                      className="w-full min-h-[46px] px-3.5 py-2.5 text-left hover:bg-[#C8FF00] text-white hover:text-[#090A0C] transition-colors flex items-center justify-between group rounded-sm"
                    >
                      <div>
                        <div className="text-xs font-bold uppercase tracking-[0.12em]">
                          Trainer Login
                        </div>
                        <div className="text-[11px] text-[#9A9CA3] group-hover:text-[#090A0C]/75">
                          Coaching portal &amp; clients
                        </div>
                      </div>
                      <Users className="w-4 h-4 shrink-0" aria-hidden="true" />
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Mobile Full-Screen Menu Trigger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
            className="md:hidden inline-flex h-11 w-11 items-center justify-center rounded-sm text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8FF00]"
          >
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Full-Screen Mobile Editorial Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, clipPath: 'inset(0% 0% 100% 0%)' }}
            animate={{ opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }}
            exit={{ opacity: 0, clipPath: 'inset(0% 0% 100% 0%)' }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="dark fixed inset-0 z-50 flex flex-col justify-between bg-[#090A0C] text-white p-6"
          >
            <div className="flex items-center justify-between h-12">
              <CalothrixLogo size="sm" />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="inline-flex h-11 w-11 items-center justify-center rounded-sm border border-white/15 text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <nav aria-label="Mobile navigation" className="my-auto space-y-2">
              {NAV_LINKS.map((link, idx) => (
                <motion.a
                  key={link.href}
                  href={link.href}
                  initial={{ opacity: 0, x: -24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 + idx * 0.07, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToTarget(link.href);
                  }}
                  className="flex min-h-[56px] items-baseline gap-4 border-b border-white/[0.08] py-3 group"
                >
                  <span className="font-mono text-xs text-[#C8FF00] tabular-nums">{link.num}</span>
                  <span className="font-display text-3xl font-bold tracking-tight text-white group-hover:text-[#C8FF00] transition-colors">
                    {link.label}
                  </span>
                </motion.a>
              ))}
            </nav>

            <div className="space-y-3 pt-6 border-t border-white/[0.1]">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuth('individual');
                  }}
                  className="flex min-h-[48px] items-center justify-center rounded-sm bg-[#C8FF00] px-4 py-3 text-xs font-bold tracking-wider uppercase text-[#090A0C]"
                >
                  Individual Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuth('trainer');
                  }}
                  className="flex min-h-[48px] items-center justify-center rounded-sm border border-white/25 px-4 py-3 text-xs font-bold tracking-wider uppercase text-white"
                >
                  Trainer Login
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
