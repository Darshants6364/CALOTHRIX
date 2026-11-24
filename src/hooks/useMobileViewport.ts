import { useEffect, useState } from 'react';

function isTextInputElement(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type?.toLowerCase() || 'text';
    return !['checkbox', 'radio', 'range', 'file', 'button', 'submit', 'reset', 'color'].includes(type);
  }
  return el.isContentEditable;
}

/**
 * Keeps CSS custom properties (--vv-height, --vv-top, --vv-keyboard-inset) synced
 * with window.visualViewport so mobile bottom sheets, modals, and inputs stay
 * positioned cleanly above the virtual keyboard on both iOS and Android.
 */
export function useMobileViewportSync(): boolean {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const root = document.documentElement;
    let baselineHeight = window.innerHeight;
    let blurTimer: number | null = null;

    const updateViewportVars = () => {
      const vv = window.visualViewport;
      const isCompactScreen = window.innerWidth < 1024;

      if (!vv) {
        root.style.setProperty('--vv-height', `${window.innerHeight}px`);
        root.style.setProperty('--vv-top', '0px');
        root.style.setProperty('--vv-keyboard-inset', '0px');
        const activeIsInput = isTextInputElement(document.activeElement);
        const open = isCompactScreen && activeIsInput;
        setKeyboardOpen(open);
        document.body.dataset.keyboardOpen = open ? 'true' : 'false';
        return;
      }

      if (vv.height > baselineHeight || Math.abs(window.innerWidth - vv.width) > 20) {
        baselineHeight = Math.max(window.innerHeight, vv.height);
      }

      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      const heightRatioOpen = baselineHeight > 0 && vv.height < baselineHeight * 0.78;
      const activeIsInput = isTextInputElement(document.activeElement);
      const open = isCompactScreen && (heightRatioOpen || activeIsInput);

      root.style.setProperty('--vv-height', `${Math.round(vv.height)}px`);
      root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
      root.style.setProperty('--vv-keyboard-inset', `${inset}px`);

      setKeyboardOpen(open);
      document.body.dataset.keyboardOpen = open ? 'true' : 'false';
    };

    const handleFocusIn = (ev: FocusEvent) => {
      if (blurTimer !== null) {
        window.clearTimeout(blurTimer);
        blurTimer = null;
      }
      const target = ev.target as Element | null;
      if (!isTextInputElement(target)) return;

      updateViewportVars();

      // Gently ensure focused field is visible above the mobile keyboard without jumping modals
      if (window.innerWidth < 1024) {
        window.setTimeout(() => {
          if (document.activeElement === target) {
            try {
              target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } catch {
              // Ignore unsupported scrollIntoView options
            }
          }
        }, 160);
      }
    };

    const handleFocusOut = () => {
      if (blurTimer !== null) {
        window.clearTimeout(blurTimer);
      }
      blurTimer = window.setTimeout(() => {
        blurTimer = null;
        if (!isTextInputElement(document.activeElement)) {
          baselineHeight = Math.max(baselineHeight, window.innerHeight);
          if (window.scrollX !== 0) {
            window.scrollTo({ left: 0 });
          }
        }
        updateViewportVars();
      }, 120);
    };

    updateViewportVars();

    const vv = window.visualViewport;
    vv?.addEventListener('resize', updateViewportVars);
    vv?.addEventListener('scroll', updateViewportVars);
    window.addEventListener('resize', updateViewportVars);
    window.addEventListener('orientationchange', updateViewportVars);
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);

    return () => {
      if (blurTimer !== null) window.clearTimeout(blurTimer);
      vv?.removeEventListener('resize', updateViewportVars);
      vv?.removeEventListener('scroll', updateViewportVars);
      window.removeEventListener('resize', updateViewportVars);
      window.removeEventListener('orientationchange', updateViewportVars);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
    };
  }, []);

  return keyboardOpen;
}
