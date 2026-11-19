interface FooterProps {
  onOpenAuth: (role: 'member' | 'trainer') => void;
}

export function Footer({ onOpenAuth }: FooterProps) {
  const scrollTo = (id: string) => {
    const el = document.querySelector(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <footer className="bg-[#090A0C] text-[#9A9CA3] border-t border-white/[0.1]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-10 pb-10 border-b border-white/[0.1]">
          <div>
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-2.5 text-white font-display text-xl font-extrabold tracking-[0.16em]"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M2 2H18V6H6V14H18V18H2V2Z" fill="#C8FF00" />
              </svg>
              <span>CALOTHRIX</span>
            </a>
            <p className="mt-3 text-sm text-[#8E929B] max-w-sm leading-relaxed">
              Built to push your limits. Connecting individuals and fitness trainers around
              purposeful training and nutrition tracking.
            </p>
          </div>

          <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-x-7 gap-y-3 text-sm">
            <a
              href="#philosophy"
              onClick={(e) => {
                e.preventDefault();
                scrollTo('#philosophy');
              }}
              className="hover:text-white transition-colors"
            >
              Our Philosophy
            </a>
            <a
              href="#experience"
              onClick={(e) => {
                e.preventDefault();
                scrollTo('#experience');
              }}
              className="hover:text-white transition-colors"
            >
              Experience
            </a>
            <a
              href="#individuals"
              onClick={(e) => {
                e.preventDefault();
                scrollTo('#individuals');
              }}
              className="hover:text-white transition-colors"
            >
              Individuals
            </a>
            <a
              href="#trainers"
              onClick={(e) => {
                e.preventDefault();
                scrollTo('#trainers');
              }}
              className="hover:text-white transition-colors"
            >
              Trainers
            </a>
            <button
              type="button"
              onClick={() => onOpenAuth('member')}
              className="text-white hover:text-[#C8FF00] transition-colors font-medium"
            >
              Individual Login
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('trainer')}
              className="text-white hover:text-[#C8FF00] transition-colors font-medium"
            >
              Trainer Login
            </button>
          </nav>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-[#6B6F78]">
          <p>© {new Date().getFullYear()} CALOTHRIX. All rights reserved.</p>
          <p className="font-mono uppercase tracking-wider">Train · Fuel · Track · Progress</p>
        </div>
      </div>
    </footer>
  );
}
