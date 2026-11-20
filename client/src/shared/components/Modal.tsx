import { useEffect, useRef, type ReactNode } from 'react';
/** Keep keyboard focus inside the active dialog and restore it on close. */
export function Modal({
  children,
  onClose,
  locked = false,
}: {
  children: ReactNode;
  onClose: () => void;
  locked?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    closeRef = useRef(onClose),
    lockedRef = useRef(locked);
  closeRef.current = onClose;
  lockedRef.current = locked;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ) ?? [],
      );
    focusable()[0]?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !lockedRef.current) {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === 'Tab') {
        const elements = focusable(),
          first = elements[0],
          last = elements.at(-1);
        if (!first) {
          event.preventDefault();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first || !ref.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !ref.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handle);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', handle);
      previous?.focus();
    };
  }, []);
  return (
    <div className="overlay" ref={ref}>
      {children}
    </div>
  );
}
