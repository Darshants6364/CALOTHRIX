import React, { useId } from 'react';

interface StreakFireIconProps {
  active?: boolean;
  className?: string;
}

export const StreakFireIcon: React.FC<StreakFireIconProps> = ({
  active = true,
  className = 'w-[18px] h-[18px]',
}) => {
  const uid = useId().replace(/:/g, '');
  const outerId = `streak-fire-outer-${uid}`;
  const innerId = `streak-fire-inner-${uid}`;

  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} shrink-0`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={outerId} x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF9E00" />
          <stop offset="50%" stopColor="#FF5A00" />
          <stop offset="100%" stopColor="#E11D48" />
        </linearGradient>
        <linearGradient id={innerId} x1="12" y1="10" x2="12" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF7C2" />
          <stop offset="100%" stopColor="#FFB800" />
        </linearGradient>
      </defs>
      <path
        d="M12.65 2.2c.2 2.45-.92 4.3-2.58 5.95-1.56 1.55-2.67 3.05-2.67 5.2 0 1.25.47 2.4 1.27 3.25-.45-.98-.32-2.25.55-3.2.55-.6 1.22-1.08 1.48-1.95 1.38 1.25 2.08 2.68 2.02 4.1.62-.55.98-1.35 1.03-2.28.92.85 1.45 2.05 1.45 3.35 0 2.05-1.2 3.85-3.05 4.72 3.35-.28 6.35-2.95 6.35-6.95 0-3.1-1.7-5.6-3.35-7.4-.52-.57-1.05-1.15-1.45-1.84-.42-.72-.78-1.6-.95-2.95-.03-.24-.07-.42-.1 0Z"
        fill={active ? `url(#${outerId})` : 'currentColor'}
        className={active ? '' : 'text-slate-400 dark:text-slate-600'}
      />
      <path
        d="M12.1 11.7c-.28.88-.98 1.45-1.55 2.05-.92.97-1.15 2.35-.58 3.55.56 1.18 1.72 2 3.03 2 1.65 0 2.95-1.3 2.95-2.95 0-1.42-.68-2.65-1.8-3.4-.05.85-.45 1.52-1.08 2-.02-1.2-.36-2.32-.97-3.25Z"
        fill={active ? `url(#${innerId})` : 'currentColor'}
        className={active ? '' : 'text-slate-300 dark:text-slate-500'}
      />
    </svg>
  );
};
