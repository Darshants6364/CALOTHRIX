import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface HorizontalScrollerProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  ariaLabel?: string;
  showArrows?: boolean;
}

/**
 * Mobile + desktop horizontal scroller that supports:
 * - Native 1-finger touch swiping (touch-pan-x)
 * - Mouse click-and-drag scrolling (with accidental-click suppression)
 * - Mouse wheel horizontal panning
 * - Auto-showing left/right arrow controls when content overflows
 */
export const HorizontalScroller: React.FC<HorizontalScrollerProps> = ({
  children,
  className = '',
  contentClassName = 'gap-1.5',
  ariaLabel,
  showArrows = true,
}) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const updateScrollEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(maxScroll - el.scrollLeft > 4);
  }, []);

  useEffect(() => {
    updateScrollEdges();
    const el = scrollerRef.current;
    if (!el) return;

    const handleResize = () => updateScrollEdges();
    window.addEventListener('resize', handleResize);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(handleResize);
      observer.observe(el);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  }, [children, updateScrollEdges]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Let touch devices use native momentum pan-x; enable drag-to-scroll for mouse/pen
    if (e.pointerType === 'touch' || e.button !== 0) return;
    const el = scrollerRef.current;
    if (!el || el.scrollWidth <= el.clientWidth + 2) return;

    dragStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startScrollLeft: el.scrollLeft,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag.active || e.pointerType === 'touch') return;
    const el = scrollerRef.current;
    if (!el) return;

    const deltaX = e.clientX - drag.startX;
    if (!drag.moved && Math.abs(deltaX) > 5) {
      drag.moved = true;
      setIsDragging(true);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if capture is unsupported
      }
    }

    if (drag.moved) {
      el.scrollLeft = drag.startScrollLeft - deltaX;
      updateScrollEdges();
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag.active) return;
    const el = scrollerRef.current;
    if (el && drag.pointerId !== null) {
      try {
        if (el.hasPointerCapture(drag.pointerId)) {
          el.releasePointerCapture(drag.pointerId);
        }
      } catch {
        // Ignore release errors
      }
    }
    drag.active = false;
    drag.pointerId = null;
    if (drag.moved) {
      setIsDragging(false);
      // Reset moved flag on next tick so onClickCapture blocks the trailing click
      window.setTimeout(() => {
        dragStateRef.current.moved = false;
      }, 0);
    }
  };

  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragStateRef.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      dragStateRef.current.moved = false;
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el || el.scrollWidth <= el.clientWidth + 2) return;
    // Translate vertical wheel scroll into horizontal scroll when hovering the strip
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && e.deltaY !== 0) {
      const next = el.scrollLeft + e.deltaY;
      const maxScroll = el.scrollWidth - el.clientWidth;
      const canPan =
        (e.deltaY > 0 && el.scrollLeft < maxScroll - 1) ||
        (e.deltaY < 0 && el.scrollLeft > 1);
      if (canPan) {
        e.preventDefault();
        el.scrollLeft = next;
        updateScrollEdges();
      }
    }
  };

  const scrollByStep = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const step = Math.max(160, Math.round(el.clientWidth * 0.72));
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

  return (
    <div className={`relative min-w-0 w-full ${className}`}>
      {showArrows && canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByStep(-1)}
          aria-label="Scroll left"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-7 rounded-lg bg-white/95 dark:bg-[#111317]/95 border border-black/10 dark:border-white/15 shadow-sm flex items-center justify-center text-slate-700 dark:text-slate-200 hover:border-lime-500 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

      <div
        ref={scrollerRef}
        role="region"
        aria-label={ariaLabel}
        onScroll={updateScrollEdges}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={handleClickCapture}
        onWheel={handleWheel}
        className={`horizontal-scroll-strip flex flex-nowrap items-center overflow-x-auto no-scrollbar select-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        } ${canScrollLeft && showArrows ? 'pl-8' : ''} ${
          canScrollRight && showArrows ? 'pr-8' : ''
        } ${contentClassName}`}
      >
        {children}
      </div>

      {showArrows && canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByStep(1)}
          aria-label="Scroll right"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-7 rounded-lg bg-white/95 dark:bg-[#111317]/95 border border-black/10 dark:border-white/15 shadow-sm flex items-center justify-center text-slate-700 dark:text-slate-200 hover:border-lime-500 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
