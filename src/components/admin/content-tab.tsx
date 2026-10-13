'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { listCourses, sectionCounts, courseConfigPath } from '@/lib/admin/paths';
import { readStorage, writeStorage } from '@/lib/storage';
import type { SectionSlug } from '@/lib/schema/meta';
import { useAdmin } from './admin-context';
import { Editor } from './editor';
import { ItemList } from './item-list';
import { Toast, type ToastData } from './toast';

const NEW_COURSE = '__new__';
const PLACE_KEY = 'parth-notes:admin:place';

type View = { kind: 'list' } | { kind: 'edit'; path: string } | { kind: 'new' };

interface Place {
  track: string;
  section: SectionSlug;
  course: string;
}

/** Course titles of a track, read from each _course.json (cached by blob sha). */
function useCourseTitles(track: string, courses: string[]): Record<string, string> {
  const { view } = useAdmin();
  const [titles, setTitles] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      courses.map(async (c) => {
        try {
          const config = JSON.parse(await view.read(courseConfigPath(track, c))) as {
            title?: string;
          };
          return [c, config.title || c] as const;
        } catch {
          return [c, c] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setTitles(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [view, track, courses]);
  return titles;
}

export function ContentTab() {
  const { snapshot, tracks, sections } = useAdmin();
  const [place, setPlace] = useState<Place>({
    track: tracks[0]?.slug ?? '',
    section: (sections[0]?.slug ?? 'learning-notes') as SectionSlug,
    course: '',
  });
  const [viewState, setView] = useState<View>({ kind: 'list' });
  const [toast, setToast] = useState<ToastData | null>(null);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const dirty = useRef(false);
  const ids = { track: useId(), course: useId() };

  // Return to the list the author was looking at last time.
  useEffect(() => {
    const saved = readStorage(PLACE_KEY);
    if (!saved) return;
    try {
      const p = JSON.parse(saved) as Place;
      if (tracks.some((t) => t.slug === p.track) && sections.some((s) => s.slug === p.section)) {
        queueMicrotask(() => setPlace(p));
      }
    } catch {
      // Ignore a corrupt value.
    }
  }, [tracks, sections]);

  useEffect(() => {
    writeStorage(PLACE_KEY, JSON.stringify(place));
  }, [place]);

  const sectionSlugs = useMemo(() => sections.map((s) => s.slug as SectionSlug), [sections]);
  const counts = useMemo(
    () => sectionCounts(snapshot.files, sectionSlugs, place.track),
    [snapshot.files, sectionSlugs, place.track],
  );
  const courses = useMemo(
    () => listCourses(snapshot.files, place.track),
    [snapshot.files, place.track],
  );
  const courseTitles = useCourseTitles(place.track, courses);

  // Keep the course selection valid when the track or the repository changes.
  const course =
    place.section === 'learning-notes'
      ? place.course === NEW_COURSE || courses.includes(place.course)
        ? place.course
        : (courses[0] ?? '')
      : '';

  const showToast = useCallback((message: string, action?: ToastData['action']) => {
    setToast({ id: Date.now(), message, action });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  const viewStateRef = useRef(viewState);
  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  /** Runs `action` now, or after the author confirms leaving unsaved changes. */
  const leave = useCallback((action: () => void) => {
    if (viewStateRef.current.kind !== 'list' && dirty.current) setPendingLeave(() => action);
    else action();
  }, []);

  function go(next: Partial<Place>, nextView: View = { kind: 'list' }) {
    leave(() => {
      setPlace((p) => ({ ...p, ...next }));
      setView(nextView);
      setPendingLeave(null);
      dirty.current = false;
    });
  }

  const section = sections.find((s) => s.slug === place.section);
  const track = tracks.find((t) => t.slug === place.track);
  const newCourse = course === NEW_COURSE;

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside aria-label="Choose what to edit" className="space-y-6">
        <div>
          <label
            htmlFor={ids.track}
            className="text-xs font-semibold tracking-wider text-muted uppercase"
          >
            Track
          </label>
          <select
            id={ids.track}
            value={place.track}
            onChange={(e) => go({ track: e.target.value, course: '' })}
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-text"
          >
            {tracks.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <nav aria-label="Sections">
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">Section</p>
          <ul className="mt-1 space-y-0.5">
            {sections.map((s) => (
              <li key={s.slug}>
                <button
                  type="button"
                  aria-current={s.slug === place.section ? 'true' : undefined}
                  onClick={() => go({ section: s.slug as SectionSlug })}
                  className={`flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left text-sm ${
                    s.slug === place.section
                      ? 'bg-nav-active font-semibold text-text'
                      : 'text-soft hover:bg-nav-active hover:text-text'
                  }`}
                >
                  {s.name}
                  <span className="rounded-full bg-panel px-2 text-xs text-muted">
                    {counts[s.slug] ?? 0}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {place.section === 'learning-notes' && (
          <div>
            <label
              htmlFor={ids.course}
              className="text-xs font-semibold tracking-wider text-muted uppercase"
            >
              Course
            </label>
            <select
              id={ids.course}
              value={course}
              onChange={(e) =>
                go(
                  { course: e.target.value },
                  e.target.value === NEW_COURSE ? { kind: 'new' } : { kind: 'list' },
                )
              }
              className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-text"
            >
              {courses.length === 0 && course !== NEW_COURSE && (
                <option value="">No courses yet</option>
              )}
              {courses.map((c) => (
                <option key={c} value={c}>
                  {courseTitles[c] ?? c}
                </option>
              ))}
              <option value={NEW_COURSE}>+ New course...</option>
            </select>
          </div>
        )}
      </aside>

      <section aria-label={section?.name} className="min-w-0">
        {viewState.kind === 'list' ? (
          <ItemList
            section={place.section}
            sectionName={section?.name ?? place.section}
            track={place.track}
            trackName={track?.name ?? place.track}
            course={
              place.section === 'learning-notes' && !newCourse ? course || undefined : undefined
            }
            onNew={() => go({}, { kind: 'new' })}
            onNewCourse={() => go({ course: NEW_COURSE }, { kind: 'new' })}
            onEdit={(path) => go({}, { kind: 'edit', path })}
            showToast={showToast}
          />
        ) : (
          <Editor
            key={
              viewState.kind === 'edit'
                ? viewState.path
                : `new:${place.section}/${place.track}/${course}`
            }
            section={place.section}
            sectionName={section?.name ?? place.section}
            track={place.track}
            course={newCourse ? undefined : course || undefined}
            newCourse={newCourse}
            path={viewState.kind === 'edit' ? viewState.path : undefined}
            onDirtyChange={(d) => {
              dirty.current = d;
            }}
            onBack={() => go(newCourse ? { course: '' } : {}, { kind: 'list' })}
            onCommitted={(message, coursePath) => {
              dirty.current = false;
              setPendingLeave(null);
              setPlace((p) => ({ ...p, course: coursePath ?? p.course }));
              setView({ kind: 'list' });
              showToast(message);
            }}
            pendingLeave={pendingLeave !== null}
            onKeepEditing={() => setPendingLeave(null)}
            onDiscard={() => {
              const action = pendingLeave;
              dirty.current = false;
              setPendingLeave(null);
              action?.();
            }}
          />
        )}
      </section>

      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}
