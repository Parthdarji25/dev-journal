# BUILD_SPEC

The complete build spec for this project. Read all of it before starting, and re-read it at the start of every phase.

```text
ROLE AND GOAL
You are a senior full-stack engineer. Build '[Site name]' (working name parth.notes): a static personal learning-notes website with a built-in admin panel that saves every change to GitHub. There is no backend server and no database. The site ships with ZERO content.

NON-NEGOTIABLE RULES
1. Static site only: Next.js App Router with output: 'export'. TypeScript strict mode. pnpm. Node LTS.
2. All content lives as files under /content in this repo. GitHub is the only storage.
3. Add NO sample or demo content of any kind: no notes, courses, questions, problems, roadmap steps, mind maps, cheat sheets, resource links or company names. Create only the folder skeleton (each empty folder holds a .gitkeep) and the two _meta JSON files. Test fixtures live in tests/fixtures, never in /content.
4. Every list must render an empty state. On public pages the empty state reads 'Coming soon'. The production build must pass with completely empty content.
5. Work in the six phases listed at the end. After each phase run lint, typecheck, tests and build, report each acceptance check as pass or fail, then STOP and wait for me to say 'continue'.
6. Ask before adding any dependency that is not listed in TECH STACK.
7. No progress tracking anywhere (no done/known/status toggles for visitors).

TECH STACK
- Next.js (App Router, output: 'export'), React, TypeScript (strict)
- Tailwind CSS with CSS variables for all colour tokens; next-themes for light/dark with no flash
- next/font self-hosting Space Grotesk (headings), IBM Plex Sans (body), JetBrains Mono (code)
- Lucide icons; Motion (formerly Framer Motion) only for page and menu transitions, honouring prefers-reduced-motion
- Content: gray-matter, unified (remark-parse, remark-gfm, remark-rehype, rehype-slug, rehype-autolink-headings, rehype-sanitize, rehype-stringify), Shiki at build time
- zod for every content schema (shared by build, validate script and admin)
- Markmap for mind maps (lazy-loaded on mind-map pages only)
- Pagefind for the search index + cmdk for the search palette
- Admin: Octokit (REST), CodeMirror 6 with markdown language support
- Quality: ESLint, Prettier, Vitest, Playwright, tsx for scripts
- Hosting: Vercel (main site + a second project for HTML artifacts). CI: GitHub Actions.

INFORMATION ARCHITECTURE
Tracks (5) are defined in content/_meta/tracks.json, in this order:
- frontend-development | Frontend Development | short: Frontend | 'What runs in the browser: UI, styling and interactivity.' | light #C2410C / dark #FDBA74
- backend-development | Backend Development | short: Backend | 'Servers, APIs, databases and the code behind them.' | light #0369A1 / dark #7DD3FC
- gen-ai-engineer | Gen AI Engineer | short: Gen AI | 'Building applications with generative AI models.' | light #6D28D9 / dark #C4B5FD
- dsa-python | DSA with Python | short: DSA | 'Data structures, algorithms and problem patterns in Python.' | light #047857 / dark #6EE7B7
- system-design | System Design | short: System Design | 'Designing systems that scale: concepts and case studies.' | light #BE185D / dark #F9A8D4
Each track also has a light tint and a dark tint for panel backgrounds (light: #FFF7F0, #F0F8FD, #F7F4FE, #EFFAF5, #FDF2F7; dark: #1A1510, #101A21, #16142A, #0F1D18, #1F131A).

Sections (6) are defined in content/_meta/sections.json: learning-notes (Learning Notes), roadmaps (Roadmap), mind-maps (Mind Maps), interview-questions (Interview Questions), cheat-sheets (Cheat Sheets), resources (Resources). Header grouping: LEARN = Learning Notes, Roadmap, Mind Maps, Resources. PRACTICE = Interview Questions, Cheat Sheets. TRACKS = the 5 track hubs.
Adding a track later must need only an edit to tracks.json plus new folders, no code change.

CONTENT STRUCTURE (create exactly this, each leaf folder with .gitkeep)
content/
  _meta/tracks.json
  _meta/sections.json
  learning-notes/<track>/            (5 track folders; courses are created later from admin)
  roadmaps/                          (one <track>.md per track, created later)
  mind-maps/<track>/                 (5 track folders)
  interview-questions/<track>/       (5 track folders)
  cheat-sheets/<track>/              (5 track folders)
  resources/                         (one <track>.md per track, created later)
Rules: lowercase-kebab-case file names, no number prefixes (order lives in _course.json or front-matter), files starting with _ are config, images go in an assets/ folder next to the files that use them, one item = one file (except roadmaps and resources: one file per track).

FILE FORMATS (each has a zod schema in src/lib/schema; the same schemas run at build, in scripts/validate-content.ts and in admin before every commit)
- _meta/tracks.json: [{slug, name, shortName, description, order, color:{light,dark}, tint:{light,dark}}]. _meta/sections.json: [{slug, name, description, group:'learn'|'practice', order}].
- learning-notes/<track>/<course>/_course.json: {title, description, order: string[] of chapter file names, html: {[fileName]: {title, description, tags: string[]}}}.
- Chapter .md front-matter: title (required), description?, tags?: string[], type: 'note' | 'problem' | 'case-study' (default 'note'). For type 'problem' also: difficulty: 'easy'|'medium'|'hard', companies: string[], topic?. A problem body uses H2 sections named Problem, Approach, Solution (a python code block), Complexity (lines 'Time: ...' and 'Space: ...'). For type 'case-study' every H2 section becomes one step.
- Chapter .html: an uploaded Claude artifact; its title/description/tags live in _course.json.
- roadmaps/<track>.md: front-matter title; body is an ordered list, each item '**Step title** - one-line description', optionally followed by a link to a notes page.
- mind-maps/<track>/<slug>.md: front-matter title; body H1 = root, H2 = branches, list items = leaves. A map may instead be an .html artifact.
- interview-questions/<track>/<slug>.md: one question per file. Front-matter: question (required), difficulty, companies: string[], tags?. Body = the answer in markdown.
- cheat-sheets/<track>/<slug>.md: front-matter title, description?; body = H2 groups, each followed by a two-column table | Code | What it does |. A sheet may instead be an .html artifact.
- resources/<track>.md: front-matter title; body = list items '[Title](url) - type: docs|course|video|book - short note'.
Admin writes updated: YYYY-MM-DD into the front-matter (or into _course.json for HTML chapters) on every save. The site reads 'last updated' from that field, never from git history, because Vercel clones are shallow.

ROUTES (all statically generated; generateStaticParams must work when content is empty)
/ | /tracks/[track] | /learning-notes | /learning-notes/[track]/[course] | /learning-notes/[track]/[course]/[chapter] | /roadmap and /roadmap/[track] | /mind-maps and /mind-maps/[track] and /mind-maps/[track]/[map] | /interview-questions and /interview-questions/[track] | /cheat-sheets and /cheat-sheets/[track] and /cheat-sheets/[track]/[sheet] | /resources and /resources/[track] | /admin | /admin/login | custom 404.
A section's index page shows the category bar with the first track (or the visitor's last choice from localStorage) selected; /<section>/[track] is the canonical, linkable page. If Next.js refuses an empty generateStaticParams for a dynamic route under static export, emit nothing for that route and make sure no page links to it; never add placeholder content.

DESIGN TOKENS (match the approved mockups)
Dark: bg #0F1115, surface #171A21, panel #1B1E26, border #262A33, dashed #3A3F4B, text #E6E8EC, soft #C9CDD4, muted #9AA1AD, nav-active #232733.
Light: bg #F7F8FA, surface #FFFFFF, panel #EEF1F5, border #DDE2E8, dashed #B8C0CB, text #14171C, soft #353B45, muted #5B6370, nav-active #E2E7EE.
Status: added green, modified amber, renamed blue, deleted red (both themes, AA contrast). Radii 8/10/14/18. Spacing on an 8px grid. Headings Space Grotesk 600-700, body IBM Plex Sans 16-18px, code JetBrains Mono. Define a visible focus-visible ring token and hover states for every interactive element.

GLOBAL UI
- Header (shared component, sticky, blurred background): logo to home; three menu buttons LEARN / PRACTICE / TRACKS. Only one menu open at a time; it opens a full-width panel under the header listing items with a colour mark and a one-line description; the group containing the current page shows a small dot and the current item shows a 'You're here' badge; Esc, outside click and choosing an item close it; aria-expanded and aria-controls are set; focus moves into the panel and returns to the button. Right side: a wide 'Search everything... Cmd/Ctrl K' button and a theme toggle.
- Mobile (under 768px): menu button, logo, search icon. The drawer holds a Track select, LEARN and PRACTICE groups, links to the 5 track hubs and the theme toggle; it traps focus and closes on Esc.
- Category bar (used by Roadmap, Mind Maps, Interview Questions, Cheat Sheets, Resources): one pill per track with its colour square and an item count; the selected pill takes the track colour border and tint; buttons use aria-pressed. The content below sits in a panel with a 4px top border in the track colour on the track tint, headed '<Track name>' with the content folder path in small muted mono text.
- Empty states: a dashed rounded box, centred muted text, e.g. 'System Design questions are coming soon.'
- Public pages never show admin controls or links to admin.
- Footer: 'Stored as files on GitHub, every change is a commit' and a link to the repo.
- Theme: follows the system by default, remembers the choice, no flash on load.

PUBLIC PAGES
1. Home: eyebrow, H1 'A notebook for everything I'm learning.', one-line subtitle, buttons 'Search everything' and 'Browse tracks'. Tracks: 5 cards (colour bar, name, description, a computed summary such as '2 courses, 1 roadmap' or 'Coming soon'), each linking to its hub. Sections: 6 tiles (name, one-line description, folder). Recently updated: the 8 newest items across all content by their updated date, each with a track-colour dot and a section chip; empty state 'Nothing yet, coming soon.'
2. Track hub /tracks/[track]: a tinted banner (eyebrow TRACK, name, description, pills linking to the other hubs), then a grid of 6 section blocks for that track showing up to 3 items each plus 'Open <section>', or 'Coming soon'.
3. Learning Notes index: title, track filter pills (All + 5, client-side), one panel per track with course cards (folder, title, chapter count and types) or 'Coming soon', and 'Open track hub'.
4. Course page: title, description, ordered chapter list with MD/HTML badges.
5. Chapter reader: breadcrumb (Learning Notes / Track / Course); left chapter list with MD/HTML badges and the current one highlighted; main column with a meta line (type, 'Last updated <date>', '~N min read'), H1, rendered markdown with heading anchors, code blocks with a Copy button that shows 'Copied', callouts (> [!TIP], [!NOTE], [!WARNING]), tables and images; right 'On this page' table of contents with scroll-spy; Previous/Next links labelled with the chapter type. Variants: type 'problem' shows a difficulty chip and 'Asked by' company chips, the Problem section visible and Approach, Solution and Complexity behind a 'Show solution' toggle, with Time/Space shown as chips. Type 'case-study' shows its H2 sections as numbered step pills with Previous/Next (one step visible at a time; print shows all). HTML chapters show their description and a framed sandboxed iframe with a toolbar ('Sandboxed', Reload, Full size).
6. Roadmap: category bar (count = steps); numbered vertical steps with circles in the track colour joined by a line; title, description and an optional link to the notes. No status or progress.
7. Mind Maps: category bar (count = maps); map selector pills; the map drawn with Markmap in the track colour with Expand all / Collapse all; HTML maps use the sandboxed iframe.
8. Interview Questions: category bar (count = questions); an 'Asked by' row of company chips with counts (All + companies found in that track's files); difficulty segmented control (All/Easy/Medium/Hard); 'x of y' count; 'Show all answers' and 'Shuffle'. Each card: Q number in the track colour, the question, difficulty chip, company chips (clicking one filters), and the answer behind 'Show answer'.
9. Cheat Sheets: category bar (count = sheets); sheet selector; a filter input; groups as cards whose rows show the code in the track colour, the description and a Copy button.
10. Resources: category bar (count = links); type filter with counts (All, Docs, Course, Video, Book); rows with a neutral type chip, title, domain and note, opening in a new tab with rel='noopener noreferrer'.
11. Search palette (Cmd/Ctrl+K, '/' and the header button): dialog with input, section chips (All + 6), track select (All + 5), results (track dot, title, snippet, section chip), up/down/Enter/Esc keys, a live result count and an empty state. Index with Pagefind using data-pagefind-filter for section and track; HTML chapters are indexed by title, description and tags only.
12. A 404 page in the same style.

ADMIN (client-only, /admin, noindex, never linked from public pages)
- Sign-in /admin/login: repository field prefilled from env; password field for a fine-grained token (must start with github_pat_); a 'Token setup' box (only this repo; Contents read and write; Metadata read; Commit statuses read; Deployments read; set an expiry); Verify checks repo push permission through the GitHub API and shows 'Token verified, write access, expires <date from the github-authentication-token-expiration header when present>' and 'Open admin'. Store the token in localStorage only. Any 401 keeps the current draft and sends the user back to sign-in with a message.
- Admin header: site name, ADMIN badge, owner/repo/branch, 'Signed in, token expires <date>', View site, Sign out, theme toggle. Tabs: Content | Activity (with a commit count). A site status on the right: 'Building...', 'Live' or 'Failed', read from the latest main commit's statuses/check runs/deployments, polled every 10s while building.
- Content tab, left column: Track select (5); section list (6) with item counts for that track; for Learning Notes a Course select with '+ New course...'.
- Content tab, list view: section title and folder path; '+ New' (hidden for roadmaps and resources once that track's file exists); rows with MD/HTML badge, title, file name and actions Edit, Rename (not for roadmaps/resources), History, Delete. Rename is inline with a live preview of the new file name. Delete asks for inline confirmation, then shows a toast with Undo. Empty state text.
- Editor: back button; 'Unsaved changes' pill and 'Draft saved in this browser' (autosave to localStorage per path, restored on return); new-course name when needed; title; Markdown/HTML switch where allowed (learning-notes, mind-maps, cheat-sheets); CodeMirror markdown editor with Write/Preview (preview uses the same pipeline and never renders uploaded HTML); a starter template per section and per track ('problem' template for dsa-python notes, 'case-study' template for system-design notes, one-file-per-question template for interview questions); HTML upload by file picker or drag-and-drop (.html/.htm only, any size) showing name and size with Replace. Leaving with unsaved changes shows an inline 'Keep editing / Discard' bar and the browser's beforeunload prompt.
- Editor side panel: CHANGES (each file with A/M/R/D and its path, including _course.json updates and .gitkeep removal), '1 commit, N files written together', CHECKS (pass/fail list from the zod schema, unique file name), commit message defaulting to 'docs(<section>): add|update <file>', and 'Commit & push' (disabled until all checks pass; shows 'Pushing...').
- History panel: commits for one file (GitHub commits API with path), each with message, short sha, date and Restore (writes the older content as a new commit).
- Activity tab: commits on main that touch content/, newest first and paginated: short sha, message, author, date and file count; 'Show changes' expands the file list with coloured status letters (A added, M modified, R renamed, D deleted); 'Revert' creates a new atomic commit that restores the parent versions of those files; a section filter; a side panel with site status, commits pushed this session, a colour legend and a backup note. A commit just pushed appears at the top, highlighted.
- Every write is ONE atomic commit through the Git Data API: get the branch ref, the base tree, create blobs, create a tree (deletions as entries with sha null), create the commit, update the ref without force. If the ref moved (409/422), refetch and show a conflict message; never overwrite newer work. Remove .gitkeep in the same commit as a folder's first real file. Adding a course also writes its _course.json; adding or reordering an HTML chapter updates _course.json.

SECURITY
- HTML artifacts are served only from a separate origin (NEXT_PUBLIC_ARTIFACTS_ORIGIN): a second Vercel project builds an artifacts-only site from content/**/*.html. Embed them with iframe sandbox='allow-scripts' (never allow-same-origin or allow-top-navigation), referrerpolicy='no-referrer', loading='lazy'.
- vercel.json headers on the main site: a Content-Security-Policy with default-src 'self'; frame-src the artifacts origin; connect-src 'self' https://api.github.com; img-src 'self' data: https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'. Use hashes instead of 'unsafe-inline' for scripts where Next.js allows. Also X-Content-Type-Options nosniff and Referrer-Policy strict-origin-when-cross-origin.
- Raw HTML inside markdown is not rendered (rehype-sanitize). The token never appears in URLs or logs. robots.txt disallows /admin.

PERFORMANCE, ACCESSIBILITY, SEO
- Lighthouse: one script, pnpm lighthouse (run on demand with fixtures, not in CI), checks home, a chapter and interview questions with Lighthouse's default mobile settings. It fails only if Accessibility, Best Practices or SEO is below 90. Performance and LCP are printed for information only and never fail the run.
- No markdown parsing in the browser on public pages; Shiki at build; Markmap, CodeMirror and cmdk load lazily.
- WCAG 2.2 AA: contrast, visible focus, full keyboard use of menus, drawer, palette and toggles, aria-pressed on toggle groups, skip-to-content link, reduced motion respected, touch targets at least 44px, layouts from 360px to 1440px.
- Per-page metadata, canonical URLs from NEXT_PUBLIC_SITE_URL, sitemap.xml, robots.txt and a default social image.

QUALITY
- ESLint, Prettier, tsc --noEmit.
- Vitest tests for every loader, parser and schema, using tests/fixtures/content (one example of each file type lives ONLY there).
- Playwright on the built site twice: with the real empty content (every page shows its empty state; menus, palette, theme toggle and mobile drawer work) and with CONTENT_DIR=tests/fixtures/content (each page type renders its content).
- scripts/validate-content.ts exposed as pnpm validate.
- .github/workflows/ci.yml on push and pull request: install, lint, typecheck, validate, unit tests, build (with Pagefind), e2e.
- .github/workflows/mirror.yml nightly and on push to main: mirror the repo to the MIRROR_REMOTE_URL secret; skip cleanly when it is not set.

EDGE CASES AND PERFORMANCE (required; each item needs a test or an acceptance check)
Content and admin
- File names: slugify titles (lowercase, transliterate to ASCII, dashes). If the result is empty, use the section name plus a short random suffix. If the name already exists in that folder, block the save with 'A file with this name already exists' and offer a numbered alternative.
- Images: admin uploads png, jpg, webp, gif or svg (any size) into the item's assets/ folder, converts raster images in the browser to WebP at most 1600px wide, inserts the markdown image line with width and height, and includes the image in the same commit. SVGs are sanitised (no scripts, no event attributes).
- Courses: reorder chapters by drag-and-drop and by keyboard (move up/down buttons), saved to _course.json. Rename a course (moves the folder in one commit and updates internal links). Delete a course (confirm by typing its name; one commit; restore .gitkeep if the track folder becomes empty).
- Internal links: scripts/check-links.ts runs in validate and CI and fails on links to missing pages. Before a rename or delete that would break links, admin lists them and offers to fix them in the same commit.
- HTML artifacts: the artifacts build injects a tiny postMessage script so the frame resizes to the artifact's height (max 4000px, then it scrolls inside). After 10s without loading, show 'This artifact could not be loaded' with Reload.
- Network and GitHub limits: retry GET requests up to 3 times with backoff. On a 403 rate limit, show when it resets. When offline, show 'You're offline, your draft is safe' and retry when back online. Never lose a draft.
- Browser storage unavailable (private mode or blocked): admin explains that sign-in and drafts need browser storage; the public site silently falls back to defaults.
- No file size limits in the app: never block a markdown, HTML or image file because of its size. Show the file size in the CHANGES list for information only. GitHub itself rejects any single file over 100 MB; if GitHub refuses a file, show its reason in plain words and keep the draft.
- Partial data renders without errors: a course with no chapters, a roadmap with no steps, a question with no companies, a sheet with an empty group.
- An unknown track or section folder inside /content makes validate fail with a message naming the folder.
Speed
- Each /<section>/[track] page contains only that track's data. Switching track navigates to the prebuilt page (prefetched on hover); never ship all tracks' data in one page.
- Budgets checked in CI: at most 100 KB of gzipped JavaScript of our own code per public page (the Next.js/React runtime and lazy chunks are not counted) and HTML under 150 KB.
- Images always carry width and height; below the fold they use loading='lazy' and decoding='async'; a chapter's first image loads eagerly.
- Fonts: Latin subset only, font-display swap, preload heading and body fonts, at most 2 weights per family.
- Caching in vercel.json: /_next/static and /pagefind files cache for one year as immutable; HTML uses 'public, max-age=0, must-revalidate' so new content shows immediately.
- Search: load the Pagefind script and index only when the palette first opens; prefetch it on hover or focus of the search button.
- Content that never changes ships as plain HTML; only small interactive parts (filters, toggles, copy buttons, menus) hydrate.

ENVIRONMENT (.env.example)
NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_SITE_NAME, NEXT_PUBLIC_GITHUB_OWNER, NEXT_PUBLIC_GITHUB_REPO, NEXT_PUBLIC_GITHUB_BRANCH=main, NEXT_PUBLIC_ARTIFACTS_ORIGIN.

PACKAGE SCRIPTS
dev | build (next build, then pagefind --site out) | build:artifacts (copy content/**/*.html to artifacts-out/ with the same paths plus its own vercel.json) | start (serve out/) | lint | typecheck | test | e2e | validate | format | lighthouse (on demand, not in CI).

CODE LAYOUT
src/app (one folder per route), src/components/{layout,ui,content,search,admin}, src/lib/{content,schema,github,search}, src/styles, scripts/, tests/{unit,e2e,fixtures}, .github/workflows, artifacts-site/ (config for the second Vercel project), README.md.

PHASES (stop after each and report)
Phase 1 - Scaffold: Next.js + TypeScript + Tailwind + fonts + tokens + next-themes, content skeleton with .gitkeep files and the two _meta files, lint/format/typecheck. Accept: pnpm build passes with empty content; light/dark toggle works with no flash.
Phase 2 - Content layer: zod schemas, loaders for every format, markdown pipeline (Shiki, anchors, callouts, sanitize), updated dates, link checker, validate script, unit tests with fixtures. Accept: pnpm validate and pnpm test pass; empty content loads as empty lists without errors; slug edge cases (symbols only, non-English, duplicates), partial data and the link checker have unit tests.
Phase 3 - Shell and reading: header with the three menus, mobile drawer, footer, home, track hubs, Learning Notes index, course page and the chapter reader with all variants (note, problem, case-study, HTML iframe). Accept: keyboard-only navigation works; every page shows its empty state with real content and renders fixtures correctly; HTML artifact frames resize to fit; the per-page JavaScript budget is met.
Phase 4 - Sections and search: category bar, Roadmap, Mind Maps, Interview Questions, Cheat Sheets, Resources, search palette with Pagefind, SEO files, 404. Accept: all filters work; the palette finds fixture items by section and track; pnpm lighthouse passes on fixtures (Accessibility, Best Practices and SEO 90+); switching track loads only that track's page; the search index loads only when the palette opens.
Phase 5a - Admin core: sign-in, Content tab (list, editor, templates, checks, drafts, unsaved guard), atomic commits, rename, delete with Undo. Test GitHub calls with mocked fetch in Vitest (no real network, no new dependencies). Accept: create/edit/rename/delete each produce exactly one commit with the expected files; a stale ref shows the conflict message; a duplicate file name is blocked.
Phase 5b - Admin extras: HTML upload, history and restore, Activity tab with file changes and revert, site status, image upload to WebP, chapter reorder, course rename and delete. Rate limit, offline and private mode are tested with mocks, never triggered for real. Accept: each action makes exactly one commit with the expected files; each error case shows a clear message and keeps the draft. Then STOP so I can do one manual check on the throwaway test repo.
Phase 6 - Hardening and delivery: security and caching headers in vercel.json, artifacts site build, Playwright suites (mock GitHub with page.route), CI and mirror workflows (mirror skips cleanly when the secret is not set), README (setup, env vars, deploy steps, content formats). No separate accessibility audit: the Playwright suites plus pnpm lighthouse at 90+ are enough. Accept: CI is green on a pull request; no sample content exists anywhere in /content; the link checker and size budgets run in CI.

DEFINITION OF DONE
All phase checks pass, CI is green, /content contains only .gitkeep files and the two _meta files, and the README lets someone deploy the site by following it.
```
