import { useEffect, useRef } from 'react';

const modalStack = [];

export default function useModalFocus(panel, onClose, enabled = true, busy = false) {
  const close = useRef(onClose);
  const pending = useRef(busy);
  close.current = onClose;
  pending.current = busy;
  useEffect(() => {
    if (!enabled || !panel.current) return;
    const element = panel.current;
    modalStack.push(element);
    const previous = document.activeElement;
    const hidden = [];
    for (let parent = element; parent.parentElement && parent !== document.body; parent = parent.parentElement) {
      for (const sibling of parent.parentElement.children) {
        if (sibling !== parent && !['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) {
          hidden.push([sibling, sibling.inert]);
          sibling.inert = true;
        }
      }
    }
    const focusable = () => [...element.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href], select, textarea, [tabindex="0"]')]
      .filter((item) => item.getClientRects().length);
    element.focus();
    const keys = (event) => {
      if (modalStack.at(-1) !== element) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (!pending.current) close.current?.();
      }
      if (event.key === 'Tab') {
        const items = focusable();
        if (!items.length) { event.preventDefault(); element.focus(); return; }
        if (event.shiftKey && (document.activeElement === items[0] || document.activeElement === element)) {
          event.preventDefault(); items.at(-1).focus();
        } else if (!event.shiftKey && (document.activeElement === items.at(-1) || document.activeElement === element)) {
          event.preventDefault(); items[0].focus();
        }
      }
    };
    const retainFocus = (event) => {
      if (modalStack.at(-1) === element && !element.contains(event.target)) element.focus();
    };
    element.addEventListener('keydown', keys);
    document.addEventListener('focusin', retainFocus);
    return () => {
      element.removeEventListener('keydown', keys);
      document.removeEventListener('focusin', retainFocus);
      modalStack.splice(modalStack.indexOf(element), 1);
      hidden.forEach(([item, value]) => { item.inert = value; });
      const target = previous?.isConnected && previous !== document.body && !previous.closest('[inert]')
        ? previous : document.querySelector('[aria-label="User menu"]');
      target?.focus();
    };
  }, [enabled, panel]);
}
