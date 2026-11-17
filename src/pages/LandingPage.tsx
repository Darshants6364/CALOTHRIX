import React from 'react';
import {
  ArrowRight,
  BarChart3,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Mic,
  Moon,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Users,
} from 'lucide-react';
import { CalothrixLogo } from '../components/CalothrixLogo';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { AccountRole } from '../types';

interface LandingPageProps {
  onSelectAuth: (role: AccountRole) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onSelectAuth }) => {
  const { resolvedTheme, toggleTheme } = useMacroLogStore();

  return (
    <div className="min-h-screen bg-[#F8F8F6] dark:bg-[#0B0F14] text-[#14181F] dark:text-[#F3F4F6] flex flex-col">
      {/* Top Bar: 3 clean zones (Brand — 4 Navigation Links — 1 Primary Action) */}
      <header className="sticky top-0 z-40 border-b border-stone-200/80 dark:border-slate-800/80 bg-[#F8F8F6]/90 dark:bg-[#0B0F14]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <CalothrixLogo size="md" />

          <nav
            aria-label="Landing sections"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            <a href="#features" className="hover:text-slate-950 dark:hover:text-white whitespace-nowrap transition-colors">
              Features
            </a>
            <a href="#meal-ai" className="hover:text-slate-950 dark:hover:text-white whitespace-nowrap transition-colors">
              Photo &amp; Voice AI
            </a>
            <a href="#portals" className="hover:text-slate-950 dark:hover:text-white whitespace-nowrap transition-colors">
              For Individuals
            </a>
            <a href="#portals" className="hover:text-slate-950 dark:hover:text-white whitespace-nowrap transition-colors">
              For Trainers
            </a>
          </nav>

          <button
            type="button"
            onClick={() => onSelectAuth('individual')}
            className="min-h-[40px] px-4 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs sm:text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <span>Sign In</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16 sm:pt-20 sm:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-6 space-y-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lime-700 dark:text-lime-400">
                Global Nutrition, Coaching &amp; Meal Intelligence
              </p>

              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-950 dark:text-slate-50 leading-[1.08] [text-wrap:balance]">
                Track every meal with precision. Coach every client with clarity.
              </h1>

              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                CALOTHRIX unifies verified IFCT 2017 Indian staples, USDA FoodData Central, Open Food Facts barcodes, photo &amp; voice meal logging, science-backed macro targets, and a dedicated Trainer Coaching Workspace.
              </p>

              {/* Separate Individual vs Trainer Entry Actions */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => onSelectAuth('individual')}
                  className="min-h-[50px] px-6 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <ClipboardCheck className="w-4 h-4" />
                  <span>Individual Login</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => onSelectAuth('trainer')}
                  className="min-h-[50px] px-6 rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#121821] text-slate-900 dark:text-slate-100 text-sm font-semibold hover:border-lime-500 dark:hover:border-lime-500 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <Users className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                  <span>Trainer Login</span>
                </button>
              </div>

              <div className="pt-2 grid grid-cols-3 gap-4 border-t border-stone-200/80 dark:border-slate-800/80 max-w-lg tabular-nums">
                <div>
                  <div className="text-lg sm:text-xl font-bold font-mono-nums text-slate-950 dark:text-slate-50">
                    3 Sources
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    IFCT, USDA &amp; OFF
                  </div>
                </div>
                <div>
                  <div className="text-lg sm:text-xl font-bold font-mono-nums text-slate-950 dark:text-slate-50">
                    Photo + Voice
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Instant AI logging
                  </div>
                </div>
                <div>
                  <div className="text-lg sm:text-xl font-bold font-mono-nums text-slate-950 dark:text-slate-50">
                    2 Portals
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Personal &amp; Coach
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="rounded-3xl overflow-hidden border border-stone-200/90 dark:border-slate-800 bg-white dark:bg-[#121821] p-2.5 shadow-sm">
                <div className="aspect-[16/10] w-full rounded-2xl overflow-hidden bg-stone-100 dark:bg-slate-900">
                  <img
                    src="/src/assets/images/hero_macro_bowl_1794908545434.jpg"
                    alt="Balanced high-protein grain, avocado, and roasted vegetable bowl tracked in CALOTHRIX"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="px-3 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      Every macro logged, scaled &amp; backed by Supabase
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                      Calories, protein, carbs, fat, fibre, micronutrients &amp; daily hydration
                    </div>
                  </div>
                  <div className="font-mono-nums text-right text-slate-800 dark:text-slate-200 font-semibold">
                    P 42g · C 54g · F 16g
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Core Platform Features: Asymmetric Showcase */}
        <section id="features" className="border-t border-stone-200/80 dark:border-slate-800/80 py-16 sm:py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-10">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lime-700 dark:text-lime-400">
                Everything Inside CALOTHRIX
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50 [text-wrap:balance]">
                Built for real everyday meals, scientific targets, and accountable coaching.
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Large Feature Card: Global Food Database + Indian Thali Photo */}
              <div className="lg:col-span-7 rounded-2xl border border-stone-200/90 dark:border-slate-800 bg-white dark:bg-[#121821] overflow-hidden flex flex-col justify-between">
                <div className="aspect-[16/9] w-full bg-stone-100 dark:bg-slate-900 overflow-hidden">
                  <img
                    src="/src/assets/images/showcase_indian_thali_1794908545240.jpg"
                    alt="Home-cooked Indian dal, chapati, sabzi, and dahi meal analyzed for nutrition"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-6 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-lime-700 dark:text-lime-400">
                    <Database className="w-4 h-4" />
                    <span>Global &amp; Indian Food Composition Catalog</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-950 dark:text-slate-50">
                    Search IFCT 2017 Indian dishes, USDA foods, and barcode products in one place
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Look up dosa, sambar, chapati, paneer, chicken breast, international brands, or scan barcodes with source provenance preserved and household units like bowls, cups, and pieces calculated automatically.
                  </p>
                </div>
              </div>

              {/* Right Column Stacked Cards */}
              <div className="lg:col-span-5 flex flex-col gap-5">
                <div id="meal-ai" className="rounded-2xl border border-stone-200/90 dark:border-slate-800 bg-white dark:bg-[#121821] p-6 space-y-3 flex-1">
                  <div className="flex items-center gap-2.5 text-lime-700 dark:text-lime-400">
                    <Camera className="w-4 h-4" />
                    <Mic className="w-4 h-4" />
                    <span className="text-xs font-semibold">AI Meal Photo &amp; Voice Analyzer</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-950 dark:text-slate-50">
                    Snap a plate photo or speak what you ate
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Upload or capture your meal, or record a quick voice note describing what you ate. Our analyzer breaks down every food item, portion weight, calories, protein, carbs, fat, and fibre—ready to edit and save to your diary and Supabase scan history.
                  </p>
                </div>

                <div className="rounded-2xl border border-stone-200/90 dark:border-slate-800 bg-white dark:bg-[#121821] p-6 space-y-3 flex-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-lime-700 dark:text-lime-400">
                    <SlidersHorizontal className="w-4 h-4" />
                    <span>Smart Fitness Goal Calculator</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-950 dark:text-slate-50">
                    BMR, maintenance burn, safe deficits &amp; meal splits
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Enter your body stats, activity level, workout cadence, and preferred pace to compute personalized calorie, protein, carb, fat, fibre, and hydration targets—plus adaptive 2–4 week progress adjustments.
                  </p>
                </div>

                <div className="rounded-2xl border border-stone-200/90 dark:border-slate-800 bg-white dark:bg-[#121821] p-6 space-y-3 flex-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-lime-700 dark:text-lime-400">
                    <BarChart3 className="w-4 h-4" />
                    <span>Consistency &amp; Macro Analytics</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-950 dark:text-slate-50">
                    28-day adherence heatmaps, protein timing &amp; weight trends
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Spot exactly which meals drive protein intake, track your 28-day consistency grid, compare calorie intake against smoothed weekly weight trends, and identify your top calorie contributors.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Separate Portals Section: Individual vs Trainer */}
        <section id="portals" className="border-t border-stone-200/80 dark:border-slate-800/80 py-16 sm:py-20 bg-white/60 dark:bg-[#0E131B]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-10">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lime-700 dark:text-lime-400">
                Two Purpose-Built Workspaces
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50 [text-wrap:balance]">
                Choose your portal to sign in
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Individual Tracker Portal Card */}
              <div className="rounded-2xl border border-stone-200/90 dark:border-slate-800 bg-white dark:bg-[#121821] p-6 sm:p-8 flex flex-col justify-between gap-6">
                <div className="space-y-4">
                  <div className="w-11 h-11 rounded-xl bg-stone-100 dark:bg-slate-800 text-slate-900 dark:text-lime-400 flex items-center justify-center">
                    <ClipboardCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-950 dark:text-slate-50">
                      For Individuals
                    </h3>
                    <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      Your private daily food diary, Photo &amp; Voice AI meal scanner, hydration tracker, weight progress trends, and personalized macro calculator.
                    </p>
                  </div>
                  <ul className="space-y-2.5 text-sm text-slate-700 dark:text-slate-300 pt-1">
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-lime-600 dark:text-lime-400 shrink-0 mt-0.5" />
                      <span>Daily calorie ring, meal calorie budgets &amp; micronutrient watch</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-lime-600 dark:text-lime-400 shrink-0 mt-0.5" />
                      <span>Snap meal photos or speak meals aloud to auto-calculate macros</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-lime-600 dark:text-lime-400 shrink-0 mt-0.5" />
                      <span>Optionally connect with a trainer &amp; control sharing permissions</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectAuth('individual')}
                  className="w-full min-h-[48px] px-5 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <span>Sign in to Individual Tracker</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Trainer Portal Card */}
              <div className="rounded-2xl border border-stone-200/90 dark:border-slate-800 bg-white dark:bg-[#121821] overflow-hidden flex flex-col justify-between">
                <div className="aspect-[16/7] w-full bg-stone-100 dark:bg-slate-900 overflow-hidden">
                  <img
                    src="/src/assets/images/showcase_trainer_desk_1794908546000.jpg"
                    alt="Fitness coach workspace reviewing client nutrition targets and check-ins"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-6 sm:p-8 flex-1 flex flex-col justify-between gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-lime-700 dark:text-lime-400">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Dedicated Coaching Workspace</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-950 dark:text-slate-50">
                        For Fitness Trainers
                      </h3>
                      <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        A completely separate dashboard to invite clients, monitor adherence cohorts, review weekly check-ins, edit authorized client macro goals, and publish structured nutrition plans.
                      </p>
                    </div>
                    <ul className="space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
                      <li className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-lime-600 dark:text-lime-400 shrink-0 mt-0.5" />
                        <span>Direct goal editing &amp; custom client blueprint builder when authorized</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-lime-600 dark:text-lime-400 shrink-0 mt-0.5" />
                        <span>Cohort adherence charts, missed-day coaching alerts &amp; private coach notes</span>
                      </li>
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectAuth('trainer')}
                    className="w-full min-h-[48px] px-5 rounded-xl border border-slate-900 dark:border-lime-500 text-slate-900 dark:text-lime-400 hover:bg-slate-900 hover:text-white dark:hover:bg-lime-500 dark:hover:text-slate-950 text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <Users className="w-4 h-4" />
                    <span>Sign in to Trainer Portal</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-stone-200/80 dark:border-slate-800/80 py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <CalothrixLogo size="sm" />
            <span>Eat Smart. Track Progress. Build Better.</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onSelectAuth('individual')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Individual Login
            </button>
            <button
              type="button"
              onClick={() => onSelectAuth('trainer')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Trainer Login
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="min-h-[34px] px-3 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-[#121821] text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 hover:bg-stone-50 dark:hover:bg-slate-800 transition-colors"
            >
              {resolvedTheme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>White</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5" />
                  <span>Dark</span>
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
