import React from 'react';

interface CalothrixLogoProps {
  size?: 'sm' | 'md';
  showWordmark?: boolean;
}

export const CalothrixLogo: React.FC<CalothrixLogoProps> = ({
  size = 'md',
  showWordmark = true,
}) => {
  const iconDim = size === 'sm' ? 30 : 36;

  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <svg
        width={iconDim}
        height={iconDim}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Rounded dark/light adaptive badge */}
        <rect
          x="2"
          y="2"
          width="36"
          height="36"
          rx="11"
          className="fill-slate-900 dark:fill-slate-800"
        />
        {/* Segmented macro ring */}
        <circle
          cx="20"
          cy="20"
          r="13.5"
          stroke="currentColor"
          strokeOpacity="0.14"
          strokeWidth="2.4"
          className="text-white"
        />
        {/* Lime Protein Arc */}
        <path
          d="M20 6.5 A13.5 13.5 0 0 1 32.8 15.8"
          stroke="#84CC16"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        {/* Amber Carbs Arc */}
        <path
          d="M32.4 25.2 A13.5 13.5 0 0 1 17.5 33.3"
          stroke="#F59E0B"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        {/* Emerald Fat & Fibre Arc */}
        <path
          d="M9.6 28.6 A13.5 13.5 0 0 1 13.5 8.2"
          stroke="#22C55E"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        {/* Crisp Geometric 'C' + central energy core */}
        <path
          d="M24.8 15.2A6.8 6.8 0 1 0 24.8 24.8"
          stroke="#FFFFFF"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <circle cx="24.5" cy="20" r="2" fill="#84CC16" />
      </svg>

      {showWordmark && (
        <span
          className={`font-display font-extrabold tracking-tight whitespace-nowrap ${
            size === 'sm' ? 'text-base' : 'text-xl'
          }`}
        >
          <span className="text-slate-900 dark:text-white">CALO</span>
          <span className="text-lime-600 dark:text-lime-400">THRIX</span>
        </span>
      )}
    </span>
  );
};
