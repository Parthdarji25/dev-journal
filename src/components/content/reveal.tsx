'use client';

import { useId, useState, type ReactNode } from 'react';
import { buttonClass } from '@/components/ui/styles';

/** Content hidden behind a toggle button. Always shown when printing. */
export function Reveal({
  showLabel,
  hideLabel,
  id,
  children,
}: {
  showLabel: string;
  hideLabel: string;
  id?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const generated = useId();
  const panelId = `${id ?? generated}-panel`;
  return (
    <div id={id} className="scroll-mt-24">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className={`${buttonClass.secondary} print:hidden`}
      >
        {open ? hideLabel : showLabel}
      </button>
      <div id={panelId} className={open ? 'mt-6' : 'hidden print:block'}>
        {children}
      </div>
    </div>
  );
}
