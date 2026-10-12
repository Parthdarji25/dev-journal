'use client';

import { useEffect } from 'react';

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API unavailable (insecure context or denied): fall back to a hidden textarea.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.className = 'sr-only';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

/**
 * Adds a Copy button to every code block inside `#targetId`. The markdown is
 * plain server HTML, so the buttons are added as a progressive enhancement.
 */
export function CodeCopy({ targetId }: { targetId: string }) {
  useEffect(() => {
    const root = document.getElementById(targetId);
    if (!root) return;
    const timers: number[] = [];
    root.querySelectorAll('pre').forEach((pre) => {
      if (pre.parentElement?.classList.contains('code-block')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'code-block';
      pre.replaceWith(wrapper);
      wrapper.append(pre);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'copy-button';
      button.textContent = 'Copy';
      button.setAttribute('aria-label', 'Copy code');
      button.addEventListener('click', async () => {
        await copyText(pre.innerText.replace(/\n$/, ''));
        button.textContent = 'Copied';
        button.setAttribute('aria-label', 'Copied');
        button.dataset.copied = '';
        timers.push(
          window.setTimeout(() => {
            button.textContent = 'Copy';
            button.setAttribute('aria-label', 'Copy code');
            delete button.dataset.copied;
          }, 2000),
        );
      });
      wrapper.append(button);
    });
    return () => timers.forEach(clearTimeout);
  }, [targetId]);

  return null;
}
