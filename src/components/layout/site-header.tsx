'use client';

import { ChevronDown, Menu, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { prefetchSearch } from '@/components/search/search-launcher';
import { isCurrent, sectionClass, trackClass, type NavGroup, type NavItem } from '@/lib/nav';
import { ThemeToggle } from './theme-toggle';

type GroupId = NavGroup['id'];

/** Opens the search palette (it listens for this event). */
function openSearch() {
  window.dispatchEvent(new Event('open-search'));
}

const searchPrefetch = { onMouseEnter: prefetchSearch, onFocus: prefetchSearch };

/** The colour mark of a menu item: the track's colour, or the section's. */
function ItemMark({ item, className = 'mt-1.5' }: { item: NavItem; className?: string }) {
  const scope = item.track
    ? `${trackClass(item.track)} bg-(--tc)`
    : `${item.section ? sectionClass(item.section) : ''} bg-(--sc)`;
  return <span aria-hidden className={`${scope} ${className} size-3 shrink-0 rounded-[3px]`} />;
}

function MenuItem({
  item,
  current,
  onChoose,
}: {
  item: NavItem;
  current: boolean;
  onChoose: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onChoose}
      aria-current={current ? 'page' : undefined}
      className={`flex min-h-11 gap-3 rounded-md p-3 transition-colors hover:bg-nav-active ${current ? 'bg-nav-active' : ''}`}
    >
      <ItemMark item={item} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 font-semibold text-text">
          {item.label}
          {current && (
            <span className="rounded-full border border-border bg-surface px-2 py-px text-[11px] font-semibold text-soft">
              You&apos;re here
            </span>
          )}
        </span>
        <span className="block text-sm text-muted">{item.description}</span>
      </span>
    </Link>
  );
}

export function SiteHeader({ nav, siteName }: { nav: NavGroup[]; siteName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState<GroupId | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const panelRefs = useRef<Partial<Record<GroupId, HTMLDivElement | null>>>({});
  const buttonRefs = useRef<Partial<Record<GroupId, HTMLButtonElement | null>>>({});
  const drawerRef = useRef<HTMLDialogElement>(null);

  // While a menu is open: Esc closes it and returns focus, an outside click closes it.
  useEffect(() => {
    if (!open) return;
    panelRefs.current[open]?.querySelector<HTMLElement>('a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(null);
        buttonRefs.current[open]?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const groupCurrent = (g: NavGroup) => g.items.some((i) => isCurrent(i, pathname));
  const tracks = nav.find((g) => g.id === 'tracks')?.items ?? [];
  const currentTrack =
    tracks.find((t) => t.track && pathname.split('/').includes(t.track))?.track ?? '';
  const closeDrawer = () => drawerRef.current?.close();

  /** Keeps Tab and Shift+Tab inside the open drawer. */
  function trapFocus(e: ReactKeyboardEvent<HTMLDialogElement>) {
    if (e.key !== 'Tab') return;
    const focusable = [
      ...e.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select'),
    ].filter((el) => el.offsetParent !== null);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <button
          type="button"
          aria-label="Open menu"
          aria-haspopup="dialog"
          onClick={() => drawerRef.current?.showModal()}
          className="-ml-2 inline-flex size-11 items-center justify-center rounded-md text-soft hover:bg-nav-active hover:text-text md:hidden"
        >
          <Menu aria-hidden className="size-5" />
        </button>

        <Link
          href="/"
          className="rounded-sm font-heading text-lg font-bold text-text hover:text-soft"
        >
          {siteName}
        </Link>

        <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
          {nav.map((group) => (
            <button
              key={group.id}
              ref={(el) => {
                buttonRefs.current[group.id] = el;
              }}
              type="button"
              aria-expanded={open === group.id}
              aria-controls={`menu-${group.id}`}
              onClick={() => setOpen(open === group.id ? null : group.id)}
              className={`relative inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm font-semibold tracking-wide uppercase transition-colors hover:bg-nav-active hover:text-text ${open === group.id ? 'bg-nav-active text-text' : 'text-soft'}`}
            >
              {group.label}
              {groupCurrent(group) && (
                <span
                  aria-hidden
                  className="absolute top-2 right-1.5 size-1.5 rounded-full bg-text"
                />
              )}
              {groupCurrent(group) && <span className="sr-only"> (current section)</span>}
              <ChevronDown
                aria-hidden
                className={`size-4 transition-transform ${open === group.id ? 'rotate-180' : ''}`}
              />
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={openSearch}
            {...searchPrefetch}
            className="hidden min-h-11 w-64 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-muted transition-colors hover:bg-nav-active hover:text-text md:inline-flex lg:w-80"
          >
            <Search aria-hidden className="size-4" />
            <span>Search everything...</span>
            <kbd className="ml-auto rounded-sm border border-border bg-panel px-1.5 font-mono text-[11px] text-soft">
              Cmd/Ctrl K
            </kbd>
          </button>
          <button
            type="button"
            aria-label="Search everything"
            onClick={openSearch}
            {...searchPrefetch}
            className="inline-flex size-11 items-center justify-center rounded-md text-soft hover:bg-nav-active hover:text-text md:hidden"
          >
            <Search aria-hidden className="size-5" />
          </button>
          <div className="hidden md:block">
            <ThemeToggle />
          </div>
        </div>
      </div>

      {nav.map((group) => (
        <div
          key={group.id}
          id={`menu-${group.id}`}
          ref={(el) => {
            panelRefs.current[group.id] = el;
          }}
          hidden={open !== group.id}
          className="animate-menu absolute inset-x-0 top-full hidden border-b border-border bg-surface shadow-lg md:block"
        >
          <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
            <p className="px-3 pb-2 text-xs font-semibold tracking-wider text-muted uppercase">
              {group.label}
            </p>
            <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => (
                <li key={item.href}>
                  <MenuItem
                    item={item}
                    current={isCurrent(item, pathname)}
                    onChoose={() => setOpen(null)}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}

      <dialog
        ref={drawerRef}
        aria-label="Menu"
        onKeyDown={trapFocus}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeDrawer();
        }}
        className="m-0 h-dvh max-h-none w-[min(22rem,calc(100%-3rem))] max-w-none border-r border-border bg-surface p-0 text-text backdrop:bg-black/50"
      >
        <div className="flex h-full flex-col overflow-y-auto p-4">
          <div className="flex items-center justify-between">
            <span className="font-heading text-lg font-bold">{siteName}</span>
            <button
              type="button"
              aria-label="Close menu"
              onClick={closeDrawer}
              className="inline-flex size-11 items-center justify-center rounded-md text-soft hover:bg-nav-active hover:text-text"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>

          <label
            className="mt-4 block text-xs font-semibold tracking-wider text-muted uppercase"
            htmlFor="drawer-track"
          >
            Track
          </label>
          <select
            id="drawer-track"
            value={currentTrack}
            onChange={(e) => {
              if (!e.target.value) return;
              closeDrawer();
              router.push(`/tracks/${e.target.value}`);
            }}
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-bg px-3 text-text"
          >
            <option value="">Choose a track</option>
            {tracks.map((t) => (
              <option key={t.track} value={t.track}>
                {t.label}
              </option>
            ))}
          </select>

          {nav.map((group) => (
            <nav key={group.id} aria-label={group.label} className="mt-6">
              <p className="px-3 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">
                {group.label}
              </p>
              <ul>
                {group.items.map((item) => {
                  const current = isCurrent(item, pathname);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={closeDrawer}
                        aria-current={current ? 'page' : undefined}
                        className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-soft hover:bg-nav-active hover:text-text ${current ? 'bg-nav-active font-semibold text-text' : ''}`}
                      >
                        <ItemMark item={item} className="" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ))}

          <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm text-muted">Theme</span>
            <ThemeToggle />
          </div>
        </div>
      </dialog>
    </header>
  );
}
