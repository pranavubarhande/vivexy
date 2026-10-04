# Package Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the reusable parts of `apps/frontend` into two new npm workspace packages (`@vivexy/ui`, `@vivexy/core`) and the reusable parts of `apps/agents-service` into a new `uv` workspace package (`vivexy-agents-core`), so `apps/frontend`/`apps/agents-service` become thin consumers rather than owners of the product logic.

**Architecture:** Each package exports its contents via `package.json`/`pyproject.toml` subpath patterns that mirror the original internal directory structure 1:1 (e.g. `@/components/ui/button` → `@vivexy/ui/button`). This makes every import rewrite in this plan a literal, mechanical string substitution (`sed`) rather than a risky manual rewrite — nothing about *what* gets imported changes, only *where from*. Every task ends in a fully buildable, fully tested state; nothing is left half-migrated between tasks.

**Tech Stack:** npm workspaces (already configured, just unused — root `package.json` already lists `"packages/*"`), `uv` workspaces (new — no root `pyproject.toml` exists yet), Next.js 16 `transpilePackages`, Tailwind v4 `@source` directives.

**Reference spec:** `docs/superpowers/specs/2026-10-04-package-extraction-design.md`

**Branch:** All work happens on `chore/package-extraction` (already created, cut from `dev`, currently holds just the spec commit).

---

## Reference paths

- `ROOT` = `/Users/home/projects/vivexy-projects/vivexy`
- `FRONTEND` = `$ROOT/apps/frontend`
- `AGENTS_SVC` = `$ROOT/apps/agents-service`

## Verified dependency lists (gathered during planning via grep across the actual moving directories — not guessed)

**`packages/ui` needs:** `react`, `react-hook-form`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-{alert-dialog,avatar,checkbox,collapsible,dialog,dropdown-menu,label,select,separator,slot,switch,tabs,tooltip}`.

**`packages/core` needs:** everything above (re-declared, since `packages/core` depends on `packages/ui`) plus `next`, `react-dom`, `axios`, `@tanstack/react-query`, `@tanstack/react-query-devtools`, `@hookform/resolvers`, `@mdxeditor/editor`, `@monaco-editor/react`, `date-fns`, `docx`, `markdown-it`, `next-themes`, `puppeteer`, `react-data-grid`, `react-markdown`, `remark-gfm`, `sonner`, `stripe`, `uuid`, `xlsx`, `zod`.

(`@monaco-editor/react` and `xlsx` were only found via dynamic `import()` calls, not static `from` imports — confirmed by grepping both patterns separately.)

---

## Task 1: Scaffold `packages/ui`

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/vitest.config.mts`
- Create: `packages/ui/vitest.setup.ts`

- [ ] **Step 1: Create the directory**

Run: `mkdir -p $ROOT/packages/ui/src`

- [ ] **Step 2: Write `packages/ui/package.json`**

```json
{
  "name": "@vivexy/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    "./utils": "./src/utils/common.ts",
    "./*": "./src/components/ui/*"
  },
  "scripts": {
    "test": "vitest run",
    "lint": "eslint src"
  },
  "peerDependencies": {
    "react": "19.2.0"
  },
  "dependencies": {
    "react-hook-form": "^7.65.0",
    "lucide-react": "^0.546.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.3.1",
    "@radix-ui/react-alert-dialog": "^1.1.15",
    "@radix-ui/react-avatar": "^1.1.10",
    "@radix-ui/react-checkbox": "^1.3.3",
    "@radix-ui/react-collapsible": "^1.1.12",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-dropdown-menu": "^2.1.16",
    "@radix-ui/react-label": "^2.1.7",
    "@radix-ui/react-select": "^2.2.6",
    "@radix-ui/react-separator": "^1.1.7",
    "@radix-ui/react-slot": "^1.2.3",
    "@radix-ui/react-switch": "^1.2.6",
    "@radix-ui/react-tabs": "^1.1.13",
    "@radix-ui/react-tooltip": "^1.2.8"
  },
  "devDependencies": {
    "@types/react": "^19",
    "typescript": "^5",
    "vitest": "^4.0.18",
    "@testing-library/react": "^16.3.2",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/dom": "^10.4.1",
    "@vitejs/plugin-react": "^5.1.4",
    "jsdom": "^28.1.0"
  }
}
```

- [ ] **Step 3: Write `packages/ui/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write `packages/ui/vitest.config.mts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
  },
});
```

- [ ] **Step 5: Write `packages/ui/vitest.setup.ts`**

Copy it verbatim from the existing frontend setup file, since it's test-infra boilerplate, not app-specific:

```bash
cp $FRONTEND/vitest.setup.ts $ROOT/packages/ui/vitest.setup.ts
```

- [ ] **Step 6: Install**

Run: `cd $ROOT && npm install`
Expected: installs cleanly, `packages/ui` appears in `node_modules/@vivexy/ui` as a symlink to `packages/ui`.

---

## Task 2: Move `components/ui` and `utils/common.ts` into `packages/ui`, rewrite imports, verify

**Files:**
- Move: `apps/frontend/components/ui/` → `packages/ui/src/components/ui/`
- Move: `apps/frontend/utils/common.ts` → `packages/ui/src/utils/common.ts`
- Move: `apps/frontend/utils/__tests__/common.test.ts` → `packages/ui/src/utils/__tests__/common.test.ts`
- Modify: every file under `apps/frontend` importing `@/components/ui/*` or `@/utils/common`
- Modify: `apps/frontend/package.json`, `apps/frontend/next.config.ts`

- [ ] **Step 1: Move the directories**

```bash
mkdir -p $ROOT/packages/ui/src/components $ROOT/packages/ui/src/utils
git -C $ROOT mv apps/frontend/components/ui packages/ui/src/components/ui
git -C $ROOT mv apps/frontend/utils/common.ts packages/ui/src/utils/common.ts
git -C $ROOT mv apps/frontend/utils/__tests__/common.test.ts packages/ui/src/utils/__tests__/common.test.ts
```

Expected: `apps/frontend/utils/` is now empty (its only contents were `common.ts` and `__tests__/`) — remove it: `rmdir $ROOT/apps/frontend/utils/__tests__ $ROOT/apps/frontend/utils` (fails harmlessly if anything else is still in there; check with `ls $ROOT/apps/frontend/utils` first — if anything remains, leave the directory and skip the `rmdir`).

- [ ] **Step 2: Confirm the moved test file needs no import fix**

`packages/ui/src/utils/__tests__/common.test.ts` already imports via a relative path (`import { cn, slugify, generateRandomToken } from '../common';`, confirmed during planning) — this continues to resolve correctly after the move, since the file and its sibling `common.ts` moved together. Verify:

```bash
head -3 $ROOT/packages/ui/src/utils/__tests__/common.test.ts
```

Expected: second line reads `import { cn, slugify, generateRandomToken } from '../common';`. Nothing to change.

- [ ] **Step 3: Rewrite every `@/components/ui/*` and `@/utils/common` import across `apps/frontend`**

```bash
cd $ROOT/apps/frontend
grep -rl "@/components/ui/\|@/utils/common" --include="*.ts" --include="*.tsx" . | grep -v node_modules | while read -r f; do
  sed -i '' "s|@/components/ui/|@vivexy/ui/|g; s|@/utils/common|@vivexy/ui/utils|g" "$f"
done
```

Expected: no output (the loop just edits files silently). Verify no `@/components/ui/` or `@/utils/common` references remain:

```bash
grep -rl "@/components/ui/\|@/utils/common" --include="*.ts" --include="*.tsx" $ROOT/apps/frontend | grep -v node_modules
```

Expected: no output.

- [ ] **Step 4: Add `@vivexy/ui` as a dependency of `apps/frontend`**

In `apps/frontend/package.json`, add to `"dependencies"`:

```json
"@vivexy/ui": "0.1.0",
```

- [ ] **Step 5: Add `transpilePackages` to `apps/frontend/next.config.ts`**

Current content:

```ts
import type { NextConfig } from 'next';
import path from 'path';
import { withSentryConfig } from '@sentry/nextjs';

const isDesktopBuild = process.env.NEXT_DESKTOP === '1';

const nextConfig: NextConfig = {
  output: isDesktopBuild ? 'export' : 'standalone',
  ...(isDesktopBuild
    ? { trailingSlash: true, images: { unoptimized: true } }
    : { outputFileTracingRoot: path.join(__dirname, '../../') }),
};
```

Add `transpilePackages`:

```ts
import type { NextConfig } from 'next';
import path from 'path';
import { withSentryConfig } from '@sentry/nextjs';

const isDesktopBuild = process.env.NEXT_DESKTOP === '1';

const nextConfig: NextConfig = {
  transpilePackages: ['@vivexy/ui'],
  output: isDesktopBuild ? 'export' : 'standalone',
  ...(isDesktopBuild
    ? { trailingSlash: true, images: { unoptimized: true } }
    : { outputFileTracingRoot: path.join(__dirname, '../../') }),
};
```

- [ ] **Step 6: Install and verify**

```bash
cd $ROOT && npm install
cd $ROOT/apps/frontend && npm run build
```

Expected: builds successfully, same route list as before (this task doesn't remove any pages).

- [ ] **Step 7: Run tests for both the moved package and the app**

```bash
cd $ROOT/packages/ui && npm test
cd $ROOT/apps/frontend && npm test
```

Expected: both pass. `common.test.ts` now runs from `packages/ui`, not `apps/frontend`.

- [ ] **Step 8: Lint**

```bash
cd $ROOT/apps/frontend && npm run lint
```

Expected: same baseline as before this task (no new errors/warnings introduced by the import rewrite).

- [ ] **Step 9: Commit**

```bash
cd $ROOT
git add -A
git status --short
```

Confirm the status shows the renames (`R`) for moved files and modifications (`M`) for every file whose imports were rewritten — nothing unexpected.

```bash
git commit -m "feat: extract packages/ui, move components/ui + utils/common

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Extract theme tokens into `packages/ui/theme.css`

**Files:**
- Create: `packages/ui/theme.css`
- Modify: `apps/frontend/app/globals.css`
- Modify: `packages/ui/package.json`

**Context:** `apps/frontend/app/globals.css` is 406 lines, almost entirely color-token definitions (`:root`, `html.skin`, `html.dark`, `html.ocean`, `html.midnight`, `html.stone` blocks) plus the Tailwind `@theme inline` mapping and a small `@layer base`/`@layer utilities` section with actual app styling (marquee animations, scrollbar styling, `.chat-bg-pattern`). Only the token/theme blocks move — the `@layer utilities` animations and the `@layer base` rule stay in `apps/frontend`, since they're app-specific styling, not design tokens.

- [ ] **Step 1: Read the current file and split it**

```bash
cat -n $ROOT/apps/frontend/app/globals.css
```

Confirm the line ranges: lines 1–55 are the `@import`/`@custom-variant`/`@theme inline` header, lines 57–324 are the five theme blocks (`:root` through `html.stone`), lines 326–406 are `@layer base` and `@layer utilities`. (These line numbers were verified during planning against the file as it exists today — re-check them with the `cat -n` output above before editing, in case the file has drifted.)

- [ ] **Step 2: Create `packages/ui/theme.css` with the token blocks**

Move lines 1–324 (the `@import` lines, `@custom-variant`, `@theme inline` block, and all five theme blocks) into the new file. Use the file's own content directly — read it with the `cat -n` output from Step 1 and write everything from `@import 'tailwindcss';` through the end of the `html.stone { ... }` block (inclusive) into:

`$ROOT/packages/ui/theme.css`

- [ ] **Step 3: Rewrite `apps/frontend/app/globals.css` to import the extracted theme**

Replace the moved lines with a single import, keeping everything that didn't move:

```css
@import '@vivexy/ui/theme.css';

@layer base {
  * {
    @apply border-border outline-ring/50;
  }

  body {
    @apply bg-background text-foreground;
  }
}

@keyframes marquee-left {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}
@keyframes marquee-right {
  from {
    transform: translateX(-50%);
  }
  to {
    transform: translateX(0);
  }
}

@layer utilities {
  .animate-marquee-left {
    animation: marquee-left 30s linear infinite;
  }
  .animate-marquee-right {
    animation: marquee-right 30s linear infinite;
  }
  .animate-marquee-left:hover,
  .animate-marquee-right:hover {
    animation-play-state: paused;
  }
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: oklch(0.7 0 0 / 25%);
    border-radius: 3px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: oklch(0.6 0 0 / 40%);
  }
  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: oklch(0.7 0 0 / 25%) transparent;
  }

  .chat-bg-pattern {
    background-image: radial-gradient(
      circle,
      oklch(0.7 0 0 / 8%) 1px,
      transparent 1px
    );
    background-size: 24px 24px;
  }
  .dark .chat-bg-pattern {
    background-image: radial-gradient(
      circle,
      oklch(0.5 0 0 / 6%) 1px,
      transparent 1px
    );
    background-size: 24px 24px;
  }
}
```

- [ ] **Step 4: Add the `theme.css` export to `packages/ui/package.json`**

Add to the `"exports"` object from Task 1:

```json
"exports": {
  "./theme.css": "./theme.css",
  "./utils": "./src/utils/common.ts",
  "./*": "./src/components/ui/*"
},
```

- [ ] **Step 5: Add a Tailwind `@source` directive so Tailwind scans the packages for utility classes**

Tailwind v4's automatic content detection does not scan `node_modules` (where the workspace-linked packages are symlinked) by default. Without this, any Tailwind utility class used only inside `packages/ui` or `packages/core` components would silently not generate CSS. Add this line near the top of `apps/frontend/app/globals.css`, right after the `@import '@vivexy/ui/theme.css';` line:

```css
@import '@vivexy/ui/theme.css';
@source '../../../packages/ui/src/**/*.{ts,tsx}';
@source '../../../packages/core/src/**/*.{ts,tsx}';
```

(The `packages/core` path won't exist until Task 6 — that's fine, `@source` pointing at a not-yet-existing directory is harmless; it'll start working once the directory exists. Don't skip adding this line now, since it's easy to forget later.)

- [ ] **Step 6: Verify the build and visual parity**

```bash
cd $ROOT/apps/frontend && npm run build
```

Expected: succeeds.

```bash
cd $ROOT/apps/frontend && npm run dev
```

Wait for it to be ready, then open `http://localhost:3000/login` in a browser (any page works — `/login` is simplest since it has no backend dependency) and visually confirm the page still renders with the expected cream "skin" background and olive accent color, matching what it looked like before this task. Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
cd $ROOT
git add -A
git commit -m "feat: extract theme tokens into packages/ui/theme.css

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Scaffold `packages/core`

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.mts`
- Create: `packages/core/vitest.setup.ts`

- [ ] **Step 1: Create the directory**

Run: `mkdir -p $ROOT/packages/core/src`

- [ ] **Step 2: Write `packages/core/package.json`**

```json
{
  "name": "@vivexy/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    "./shared/*": "./src/components/shared/*",
    "./chat": "./src/components/chat/index.ts",
    "./chat/*": "./src/components/chat/*",
    "./dashboard/*": "./src/components/dashboard/*",
    "./settings/*": "./src/components/settings/*",
    "./auth/*": "./src/components/auth/*",
    "./desktop/*": "./src/components/desktop/*",
    "./scheduled-tasks/*": "./src/components/scheduled-tasks/*",
    "./hooks/*": "./src/hooks/*",
    "./services/*": "./src/services/*",
    "./types/*": "./src/types/*",
    "./lib/*": "./src/lib/*",
    "./constants/*": "./src/constants/*",
    "./configs/*": "./src/configs/*",
    "./agents/*": "./src/agents/*"
  },
  "scripts": {
    "test": "vitest run",
    "lint": "eslint src"
  },
  "peerDependencies": {
    "react": "19.2.0",
    "react-dom": "19.2.0",
    "next": "^16.0.10"
  },
  "dependencies": {
    "@vivexy/ui": "0.1.0",
    "react-hook-form": "^7.65.0",
    "lucide-react": "^0.546.0",
    "axios": "^1.12.2",
    "@tanstack/react-query": "^5.90.5",
    "@tanstack/react-query-devtools": "^5.90.2",
    "@hookform/resolvers": "^5.2.2",
    "@mdxeditor/editor": "^3.52.4",
    "@monaco-editor/react": "^4.7.0",
    "date-fns": "^4.1.0",
    "docx": "^9.5.1",
    "markdown-it": "^14.1.0",
    "next-themes": "^0.4.6",
    "puppeteer": "^24.32.0",
    "react-data-grid": "^7.0.0-beta.59",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1",
    "sonner": "^2.0.7",
    "stripe": "^19.1.0",
    "uuid": "^13.0.0",
    "xlsx": "^0.18.5",
    "zod": "^4.1.12"
  },
  "devDependencies": {
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/node": "^20",
    "typescript": "^5",
    "vitest": "^4.0.18",
    "@testing-library/react": "^16.3.2",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/dom": "^10.4.1",
    "@vitejs/plugin-react": "^5.1.4",
    "jsdom": "^28.1.0"
  }
}
```

- [ ] **Step 3: Write `packages/core/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "noEmit": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules"]
}
```

(`@/*` → `./src/*` matters here: the files moving into this package use `@/` imports to reference *each other*, e.g. a chat component importing a hook via `@/hooks/useChat`. Keeping the same alias, just re-rooted to `src/`, means those internal cross-references don't need rewriting — only imports crossing the package boundary do.)

- [ ] **Step 4: Write `packages/core/vitest.config.mts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 5: Write `packages/core/vitest.setup.ts`**

```bash
cp $FRONTEND/vitest.setup.ts $ROOT/packages/core/vitest.setup.ts
```

- [ ] **Step 6: Install**

```bash
cd $ROOT && npm install
```

Expected: installs cleanly, `packages/core` resolves `@vivexy/ui` as a workspace dependency.

---

## Task 5: Move `components/shared`, `hooks`, `services`, `types` into `packages/core`, rewrite imports, verify

**Files:**
- Move: `apps/frontend/components/shared/` → `packages/core/src/components/shared/`
- Move: `apps/frontend/hooks/` → `packages/core/src/hooks/`
- Move: `apps/frontend/services/` → `packages/core/src/services/`
- Move: `apps/frontend/types/` → `packages/core/src/types/`
- Modify: every file under `apps/frontend` importing these paths

**Context:** `components/chat`, `components/dashboard`, `components/settings`, `components/auth`, `components/desktop`, `components/scheduled-tasks`, `lib`, and `agents` (moving in Task 6) all import from `hooks/`, `services/`, `types/`, and `components/shared/` internally. Since those directories haven't moved yet, their internal `@/hooks/...`, `@/services/...`, `@/types/...`, `@/components/shared/...` imports still resolve fine against the **not-yet-moved** local copies in `apps/frontend` — this task doesn't touch them. Only files that have *already* moved, or that live in `apps/frontend/app/` (pages), need their imports rewritten now.

**Correction found during Task 2:** `hooks/use-mobile.ts` is a dependency-free, pure UI hook (window.matchMedia breakpoint check) with no product logic. It's used by `components/ui/sidebar.tsx`, which already moved into `packages/ui` in Task 2 — the Task 2 implementer correctly flagged that `packages/ui` can't depend on `packages/core` (that dependency already runs the other way: `packages/core` depends on `packages/ui`), so they temporarily duplicated the hook into `packages/ui/src/hooks/use-mobile.ts` rather than invent a circular dependency, and left `apps/frontend/hooks/use-mobile.ts` in place for its other consumer, `components/chat/chat-panels.tsx` (moving to `packages/core` in Task 6). This task resolves that duplication: `use-mobile.ts` does **not** move into `packages/core` — it stays out of the `hooks/` move below, and its `apps/frontend` copy gets deleted once confirmed redundant with the `packages/ui` copy (Step 1a). `chat-panels.tsx`'s import gets pointed at `@vivexy/ui/hooks/use-mobile` instead of `@vivexy/core/hooks/use-mobile` when Task 6 moves it.

- [ ] **Step 1: Move the directories**

```bash
mkdir -p $ROOT/packages/core/src/components
git -C $ROOT mv apps/frontend/components/shared packages/core/src/components/shared
git -C $ROOT mv apps/frontend/hooks packages/core/src/hooks
git -C $ROOT mv apps/frontend/services packages/core/src/services
git -C $ROOT mv apps/frontend/types packages/core/src/types
```

- [ ] **Step 1a: Undo the `use-mobile.ts` move — it belongs in `packages/ui`, not `packages/core`**

The `git mv` above just moved `hooks/use-mobile.ts` into `packages/core/src/hooks/use-mobile.ts` along with everything else in `hooks/`. Back that one file out, since `packages/ui/src/hooks/use-mobile.ts` (created during Task 2) is already the same content:

```bash
diff $ROOT/packages/core/src/hooks/use-mobile.ts $ROOT/packages/ui/src/hooks/use-mobile.ts
```

Expected: no output (byte-identical — confirms the Task 2 duplicate is safe to treat as the canonical copy). Then remove the redundant copy from `packages/core`:

```bash
git -C $ROOT rm packages/core/src/hooks/use-mobile.ts
```

Add a `./hooks/*` export to `packages/ui/package.json`'s `"exports"` object (it currently only has `"./theme.css"`, `"./utils"`, and `"./*"` from Tasks 1 and 3):

```json
"exports": {
  "./theme.css": "./theme.css",
  "./utils": "./src/utils/common.ts",
  "./hooks/*": "./src/hooks/*.ts",
  "./*": "./src/components/ui/*.tsx"
},
```

(Note the `.tsx` extension on the last pattern — the Task 2 implementer found that TypeScript's `bundler` module resolution needs it explicitly for that wildcard, unlike bundler runtime resolution which doesn't; that fix is already committed. `./hooks/*` needs its own `.ts` extension for the same reason.)

- [ ] **Step 2: Fix internal `@/` imports inside the four moved directories**

These directories' own files reference each other and other not-yet-moved code via `@/`. Inside `packages/core`, `@/` now resolves to `packages/core/src/` (per the `tsconfig.json` paths from Task 4), so any `@/hooks/...`, `@/services/...`, `@/types/...`, `@/components/shared/...` reference used *within* these four directories already resolves correctly without changes — same alias, same relative structure, just re-rooted. The only references that need rewriting are imports from code that **hasn't moved yet** (e.g. `@/components/ui/button`, which Task 2 already rewrote to `@vivexy/ui/button` everywhere, including inside these directories, so that's already handled) or `@/components/chat/...`, `@/components/dashboard/...`, `@/components/settings/...`, `@/components/auth/...`, `@/components/desktop/...`, `@/components/scheduled-tasks/...`, `@/lib/...`, `@/agents/...`, `@/constants/...`, `@/configs/...` (not moving until Task 6 — if the moved code references any of these, leave them as `@/...` for now; Task 6 will fix them when those directories move, since at that point Task 6 rewrites imports project-wide).

Check whether any of the four just-moved directories import something that's moving in Task 6:

```bash
grep -rln "@/components/chat\|@/components/dashboard\|@/components/settings\|@/components/auth\|@/components/desktop\|@/components/scheduled-tasks\|@/lib/\|@/agents/\|@/constants/\|@/configs/" $ROOT/packages/core/src/components/shared $ROOT/packages/core/src/hooks $ROOT/packages/core/src/services $ROOT/packages/core/src/types
```

If this returns files, note them — they'll be fixed automatically by Task 6's project-wide rewrite (Task 6 runs its `sed` pass over the whole repo, including `packages/core`, so these don't need manual handling now). If it returns nothing, nothing to do here.

- [ ] **Step 3: Rewrite `@/components/shared/*`, `@/hooks/*`, `@/services/*`, `@/types/*` imports across `apps/frontend`**

The `@/hooks/use-mobile` special case (from Step 1a) must be rewritten to `@vivexy/ui/hooks/use-mobile` — **not** `@vivexy/core/hooks/use-mobile` like every other hook. Run that `sed` rule first, so the later generic `@/hooks/` rule no longer matches it (it won't start with `@/hooks/` anymore by the time the generic rule runs):

```bash
cd $ROOT/apps/frontend
grep -rl "@/components/shared/\|@/hooks/\|@/services/\|@/types/" --include="*.ts" --include="*.tsx" . | grep -v node_modules | while read -r f; do
  sed -i '' \
    -e "s|@/hooks/use-mobile|@vivexy/ui/hooks/use-mobile|g" \
    -e "s|@/components/shared/|@vivexy/core/shared/|g" \
    -e "s|@/hooks/|@vivexy/core/hooks/|g" \
    -e "s|@/services/|@vivexy/core/services/|g" \
    -e "s|@/types/|@vivexy/core/types/|g" \
    "$f"
done
```

Verify nothing's left:

```bash
grep -rl "@/components/shared/\|@/hooks/\|@/services/\|@/types/" --include="*.ts" --include="*.tsx" $ROOT/apps/frontend | grep -v node_modules
```

Expected: this still matches files under `apps/frontend/components/chat`, `dashboard`, `settings`, `auth`, `desktop`, `scheduled-tasks` (not moved yet — fine, they're not moving until Task 6, and Task 6 does its own rewrite pass over them before they move) — but zero matches under `apps/frontend/app/` (the pages, already fully rewritten now, since pages don't move at all in this plan).

Check the page directory specifically:

```bash
grep -rl "@/components/shared/\|@/hooks/\|@/services/\|@/types/" --include="*.ts" --include="*.tsx" $ROOT/apps/frontend/app
```

Expected: no output.

- [ ] **Step 4: Add `@vivexy/core` as a dependency of `apps/frontend`**

In `apps/frontend/package.json`, add to `"dependencies"`:

```json
"@vivexy/core": "0.1.0",
```

And add `'@vivexy/core'` to the `transpilePackages` array in `next.config.ts` (from Task 2, Step 5):

```ts
transpilePackages: ['@vivexy/ui', '@vivexy/core'],
```

- [ ] **Step 5: Install and verify**

```bash
cd $ROOT && npm install
cd $ROOT/apps/frontend && npm run build
```

Expected: builds successfully. `components/chat`, `dashboard`, `settings`, `auth`, `desktop`, `scheduled-tasks` still exist locally in `apps/frontend` and still import `@vivexy/core/hooks/...` etc. correctly, since those subpaths now resolve into the package.

```bash
cd $ROOT/packages/core && npm test
cd $ROOT/apps/frontend && npm test
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
cd $ROOT
git add -A
git commit -m "feat: move components/shared, hooks, services, types into packages/core

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Move the rest of `packages/core`'s contents, rewrite remaining imports, verify

**Files:**
- Move: `apps/frontend/components/{chat,dashboard,settings,auth,desktop,scheduled-tasks}/` → `packages/core/src/components/{...}/`
- Move: `apps/frontend/lib/` → `packages/core/src/lib/`
- Move: `apps/frontend/constants/routes.ts` → `packages/core/src/constants/routes.ts`
- Move: `apps/frontend/constants/stream-events.ts` → `packages/core/src/constants/stream-events.ts`
- Move: `apps/frontend/configs/billing.ts` → `packages/core/src/configs/billing.ts`
- Move: `apps/frontend/agents/` → `packages/core/src/agents/`
- Modify: every remaining file under `apps/frontend` (mainly `app/`) importing these paths

**Context:** `constants/project.ts` (the `APP_NAME` branding constant) stays in `apps/frontend` — per the spec, branding is explicitly app-level, not packaged.

**Important finding from Task 5:** Next.js/webpack resolves the `@/` alias using *only* `apps/frontend`'s own `tsconfig.json` paths — it does not re-scope `@/` per workspace package, regardless of what each package's own `tsconfig.json` says. This means a `@/X` reference inside a file **continues to work unchanged** if and only if `X` is a file that's still physically located in `apps/frontend` (e.g. `@/constants/project`, which never moves — that one's fine, don't touch it). But if `X` is something that has *also* moved out of `apps/frontend` into a package, `@/X` silently points at a now-deleted location and breaks the build. Task 6's Step 2 below already rewrites `@/components/chat`, `@/lib/`, `@/agents/`, etc. across **both** `apps/frontend` and `packages/core/src` (not just `apps/frontend`), which correctly handles self-references within the newly-moved code for the 10 categories this task moves. After Step 2 runs, if the build still fails on a module-resolution error, check whether the failing `@/X` reference points at something that has moved (fix: rewrite to `@vivexy/core/X` or a relative import, following the same pattern already established in Tasks 2 and 5) versus something that's still in `apps/frontend` (in which case it's a different bug, not this issue).

- [ ] **Step 1: Move the directories and files**

```bash
mkdir -p $ROOT/packages/core/src/constants
git -C $ROOT mv apps/frontend/components/chat packages/core/src/components/chat
git -C $ROOT mv apps/frontend/components/dashboard packages/core/src/components/dashboard
git -C $ROOT mv apps/frontend/components/settings packages/core/src/components/settings
git -C $ROOT mv apps/frontend/components/auth packages/core/src/components/auth
git -C $ROOT mv apps/frontend/components/desktop packages/core/src/components/desktop
git -C $ROOT mv apps/frontend/components/scheduled-tasks packages/core/src/components/scheduled-tasks
git -C $ROOT mv apps/frontend/lib packages/core/src/lib
git -C $ROOT mv apps/frontend/constants/routes.ts packages/core/src/constants/routes.ts
git -C $ROOT mv apps/frontend/constants/stream-events.ts packages/core/src/constants/stream-events.ts
git -C $ROOT mv apps/frontend/configs/billing.ts packages/core/src/configs/billing.ts
git -C $ROOT mv apps/frontend/agents packages/core/src/agents
```

Expected: `apps/frontend/components/` now contains only `ui/` — wait, `ui/` already moved in Task 2, so `apps/frontend/components/` should now be empty. Remove it if so: `rmdir $ROOT/apps/frontend/components` (check with `ls $ROOT/apps/frontend/components` first; skip if anything unexpected remains). Similarly check `apps/frontend/configs/` — if `billing.ts` was its only file, `rmdir $ROOT/apps/frontend/configs`.

- [ ] **Step 2: Rewrite every remaining old-path import across the whole repo**

This is the big rewrite — it needs to cover both `apps/frontend` (for files like `app/*/page.tsx` that still reference the old paths) and `packages/core/src` itself (for the cross-references noted in Task 5 Step 2, which were deferred to this step):

```bash
cd $ROOT
grep -rl "@/components/chat\|@/components/dashboard\|@/components/settings\|@/components/auth\|@/components/desktop\|@/components/scheduled-tasks\|@/lib/\|@/agents/\|@/constants/routes\|@/constants/stream-events\|@/configs/billing" \
  --include="*.ts" --include="*.tsx" apps/frontend packages/core/src | while read -r f; do
  sed -i '' \
    -e "s|@/components/chat|@vivexy/core/chat|g" \
    -e "s|@/components/dashboard/|@vivexy/core/dashboard/|g" \
    -e "s|@/components/settings/|@vivexy/core/settings/|g" \
    -e "s|@/components/auth/|@vivexy/core/auth/|g" \
    -e "s|@/components/desktop/|@vivexy/core/desktop/|g" \
    -e "s|@/components/scheduled-tasks/|@vivexy/core/scheduled-tasks/|g" \
    -e "s|@/lib/|@vivexy/core/lib/|g" \
    -e "s|@/agents/|@vivexy/core/agents/|g" \
    -e "s|@/constants/routes|@vivexy/core/constants/routes|g" \
    -e "s|@/constants/stream-events|@vivexy/core/constants/stream-events|g" \
    -e "s|@/configs/billing|@vivexy/core/configs/billing|g" \
    "$f"
done
```

- [ ] **Step 3: Verify no old references remain anywhere in `apps/frontend` or `packages/core`**

```bash
grep -rl "@/components/chat\|@/components/dashboard\|@/components/settings\|@/components/auth\|@/components/desktop\|@/components/scheduled-tasks\|@/lib/\|@/agents/\|@/constants/routes\|@/constants/stream-events\|@/configs/billing" \
  --include="*.ts" --include="*.tsx" $ROOT/apps/frontend $ROOT/packages/core/src
```

Expected: no output.

- [ ] **Step 4: Install and verify the full build**

```bash
cd $ROOT && npm install
cd $ROOT/apps/frontend && npm run build
```

Expected: succeeds, same route list as before (no pages removed in this plan — only their underlying components relocated).

```bash
cd $ROOT/apps/frontend && npm run lint
```

Expected: same baseline warnings as before this task, no new errors.

```bash
cd $ROOT/packages/ui && npm test
cd $ROOT/packages/core && npm test
cd $ROOT/apps/frontend && npm test
```

Expected: all three pass. (`components/chat/__tests__/chat-header.test.tsx` now runs from `packages/core`.)

- [ ] **Step 5: Manual smoke check**

```bash
cd $ROOT/apps/frontend && npm run dev
```

Visit `http://localhost:3000/login` and click through to confirm the app still loads and renders correctly (full backend isn't required for this visual check — just confirming no client-side import errors). Check the browser console for errors. Stop the dev server when done.

- [ ] **Step 6: Commit**

```bash
cd $ROOT
git add -A
git commit -m "feat: complete packages/core extraction (chat, dashboard, settings, auth, desktop, scheduled-tasks, lib, agents)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Set up the `uv` workspace and scaffold `packages/agents-core`

**Files:**
- Create: `pyproject.toml` (new, at repo root)
- Create: `packages/agents-core/pyproject.toml`

- [ ] **Step 1: Create the root `pyproject.toml` declaring the workspace**

```toml
[tool.uv.workspace]
members = ["apps/agents-service", "packages/agents-core"]
```

- [ ] **Step 2: Create the `packages/agents-core` directory**

```bash
mkdir -p $ROOT/packages/agents-core/src/agents_core
touch $ROOT/packages/agents-core/src/agents_core/__init__.py
```

- [ ] **Step 3: Write `packages/agents-core/pyproject.toml`**

Carries forward the full dependency list from `apps/agents-service/pyproject.toml` (verified during planning: the code moving into this package in Tasks 8–9 uses essentially all of it):

```toml
[project]
name = "vivexy-agents-core"
version = "0.1.0"
description = "Core agent orchestration, tools, and business logic for Vivexy"
requires-python = ">=3.11"
dependencies = [
    "flask>=3.0.0",
    "flask-cors>=4.0.0",
    "flask-sqlalchemy>=3.1.1",
    "python-dotenv>=1.0.0",
    "psycopg2-binary>=2.9.0",
    "redis>=5.0.0",
    "langchain==1.2.0",
    "langchain-core>=1.2.6",
    "langchain-google-genai==4.1.2",
    "langchain-community==0.4.1",
    "langchain-huggingface==1.2.0",
    "sentence_transformers==5.2.0",
    "rank-bm25==0.2.2",
    "pypdf==6.5.0",
    "openpyxl==3.1.5",
    "python-docx==1.2.0",
    "langgraph==1.0.5",
    "pinecone>=5.0.0",
    "pandas>=2.0.0",
    "pydantic>=2.5.0",
    "bcrypt>=4.1.2",
    "pyjwt>=2.8.0",
    "yfinance>=0.2.0",
    "requests>=2.31.0",
    "boto3>=1.42.43",
    "reportlab>=4.0.0",
    "langchain-groq>=1.1.0",
    "langchain-openai>=1.1.0",
    "langchain-anthropic>=1.1.0",
    "langchain-mistralai>=0.2.0",
    "langchain-together>=0.4.0",
    "langchain-fireworks>=0.2.0",
    "langchain-cohere>=0.3.0",
    "langchain-ollama>=0.3.0",
    "langchain-xai>=0.2.0",
    "cryptography>=43.0.0",
    "composio-langchain>=0.11.1",
    "pypandoc>=1.16.2",
    "markdown2>=2.5.4",
    "weasyprint>=68.1",
    "pika>=1.3.0",
    "sentry-sdk[flask]>=2.54.0",
    "deepagents>=0.3.3",
    "langchain-daytona>=0.0.2",
    "daytona>=0.18.1",
    "exa-py>=0.1.8",
    "crawl4ai>=0.4.0",
    "playwright>=1.48.0",
    "flasgger",
    "langgraph-checkpoint-redis>=0.3.6",
    "httpx>=0.27.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "black>=24.0.0",
    "isort>=5.0.0",
    "flake8>=7.0.0",
    "pytest-flask>=1.3.0",
]

[tool.black]
line-length = 88
target-version = ["py311"]
include = "\\.pyi?$"

[tool.isort]
profile = "black"
multi_line_output = 3
line_length = 88
known_first_party = ["agents_core"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/agents_core"]
```

(`httpx` is added explicitly — it wasn't in the original dependency list as a top-level entry, but `app/tools/finance/sec_edgar_tools.py` and `app/tools/compliance/sanctions_tools.py` both import it directly, confirmed during planning. It's almost certainly already present transitively via another dependency, but direct use means it needs to be a direct dependency too.)

- [ ] **Step 4: Sync**

```bash
cd $ROOT && uv sync
```

Expected: resolves and installs the workspace, including the new (currently near-empty) `agents_core` package as an editable local dependency.

---

## Task 8: Move `models`, `schemas`, `constants`, `enum`, `types`, `utils`, `tool_helpers`, `file_to_process` into `packages/agents-core`, rewrite imports, verify

**Files:**
- Move: `apps/agents-service/app/{models,schemas,constants,enum,types,utils,tool_helpers,file_to_process}/` → `packages/agents-core/src/agents_core/{...}/`
- Modify: `apps/agents-service/app/__init__.py`, `apps/agents-service/alembic/env.py`, and any other remaining app-level file referencing these

**Context:** Like the frontend extraction, code that hasn't moved yet (`app/agents`, `app/business_logic`, `app/routes`, `app/tools`, `app/skills`, `app/services`, `app/middlewares`, `worker/` — all moving in Task 9–10) keeps referencing these via its own existing `from app.models import ...`-style imports for now; Python resolves `app.models` as a regular local package within `apps/agents-service` until those modules themselves move. Only `app/__init__.py` and `alembic/env.py` — which stay in `apps/agents-service` permanently — need their imports fixed in this task.

- [ ] **Step 1: Move the directories**

```bash
cd $ROOT/apps/agents-service
git -C $ROOT mv apps/agents-service/app/models packages/agents-core/src/agents_core/models
git -C $ROOT mv apps/agents-service/app/schemas packages/agents-core/src/agents_core/schemas
git -C $ROOT mv apps/agents-service/app/constants packages/agents-core/src/agents_core/constants
git -C $ROOT mv apps/agents-service/app/enum packages/agents-core/src/agents_core/enum
git -C $ROOT mv apps/agents-service/app/types packages/agents-core/src/agents_core/types
git -C $ROOT mv apps/agents-service/app/utils packages/agents-core/src/agents_core/utils
git -C $ROOT mv apps/agents-service/app/tool_helpers packages/agents-core/src/agents_core/tool_helpers
git -C $ROOT mv apps/agents-service/app/file_to_process packages/agents-core/src/agents_core/file_to_process
```

- [ ] **Step 2: Rewrite imports inside the moved modules (internal cross-references)**

These eight directories reference each other via `from app.models import ...`, `from app.utils.X import ...`, etc. Rewrite all `from app.` and `import app.` references that point at these eight (already-moved) modules, within the moved code itself:

```bash
cd $ROOT/packages/agents-core/src/agents_core
grep -rl "from app\.\(models\|schemas\|constants\|enum\|types\|utils\|tool_helpers\|file_to_process\)" --include="*.py" . | while read -r f; do
  sed -i '' \
    -e "s|from app\.models|from agents_core.models|g" \
    -e "s|from app\.schemas|from agents_core.schemas|g" \
    -e "s|from app\.constants|from agents_core.constants|g" \
    -e "s|from app\.enum|from agents_core.enum|g" \
    -e "s|from app\.types|from agents_core.types|g" \
    -e "s|from app\.utils|from agents_core.utils|g" \
    -e "s|from app\.tool_helpers|from agents_core.tool_helpers|g" \
    -e "s|from app\.file_to_process|from agents_core.file_to_process|g" \
    "$f"
done
```

- [ ] **Step 3: Rewrite `app/__init__.py` and `alembic/env.py`**

```bash
cd $ROOT/apps/agents-service
grep -n "from app\.\(models\|utils\)" app/__init__.py alembic/env.py
```

For every match, change `app.models` → `agents_core.models` and `app.utils` → `agents_core.utils`:

```bash
sed -i '' "s|from app\.models|from agents_core.models|g; s|from app\.utils|from agents_core.utils|g" app/__init__.py alembic/env.py
```

- [ ] **Step 4: Add `vivexy-agents-core` as a dependency of `apps/agents-service`**

In `apps/agents-service/pyproject.toml`, add:

```toml
dependencies = [
    "flask>=3.0.0",
    "flask-cors>=4.0.0",
    "flasgger",
    "sentry-sdk[flask]>=2.54.0",
    "python-dotenv>=1.0.0",
    "sqlalchemy>=2.0.0",
    "alembic>=1.13.0",
    "vivexy-agents-core",
]

[tool.uv.sources]
vivexy-agents-core = { workspace = true }
```

(This replaces the much longer original `dependencies` list — the packages that list contained are no longer needed directly by `apps/agents-service` now that the code using them lives in `vivexy-agents-core`, which pulls them in transitively. Keep the rest of the file — `[project.optional-dependencies]`, `[tool.black]`, `[tool.isort]`, `[tool.hatch.build.targets.wheel]` — unchanged.)

- [ ] **Step 5: Sync and verify imports resolve**

```bash
cd $ROOT && uv sync
cd $ROOT/apps/agents-service && uv run python -c "from agents_core.models import db; from agents_core.utils.casing import camel_to_snake; print('ok')"
```

Expected: prints `ok` with no import errors.

- [ ] **Step 6: Run the existing test suite**

```bash
cd $ROOT/apps/agents-service && uv run --extra dev pytest -x
```

Expected: passes. (Full app boot isn't tested yet — `app/agents`, `business_logic`, `routes`, `tools`, `skills` haven't moved, so `app/__init__.py`'s blueprint imports still reference local, not-yet-moved modules and still work as before.)

- [ ] **Step 7: Commit**

```bash
cd $ROOT
git add -A
git commit -m "feat: move models, schemas, constants, enum, types, utils, tool_helpers, file_to_process into packages/agents-core

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Move `agents`, `business_logic`, `tools`, `skills`, `services`, `middlewares`, `worker` into `packages/agents-core`, rewrite imports, verify

**Files:**
- Move: `apps/agents-service/app/{agents,business_logic,tools,skills,services,middlewares}/` → `packages/agents-core/src/agents_core/{...}/`
- Move: `apps/agents-service/worker/` → `packages/agents-core/src/agents_core/worker/`
- Modify: everything referencing these (now mostly within `packages/agents-core` itself, since `routes/` — the main remaining consumer — moves in Task 10)

- [ ] **Step 1: Move the directories**

```bash
git -C $ROOT mv apps/agents-service/app/agents packages/agents-core/src/agents_core/agents
git -C $ROOT mv apps/agents-service/app/business_logic packages/agents-core/src/agents_core/business_logic
git -C $ROOT mv apps/agents-service/app/tools packages/agents-core/src/agents_core/tools
git -C $ROOT mv apps/agents-service/app/skills packages/agents-core/src/agents_core/skills
git -C $ROOT mv apps/agents-service/app/services packages/agents-core/src/agents_core/services
git -C $ROOT mv apps/agents-service/app/middlewares packages/agents-core/src/agents_core/middlewares
git -C $ROOT mv apps/agents-service/worker packages/agents-core/src/agents_core/worker
```

- [ ] **Step 2: Rewrite `from app.` references across the whole repo for these seven modules**

This needs to run across both `apps/agents-service` (for `app/routes/*`, not yet moved, which reference these) and `packages/agents-core/src` (for internal cross-references between the moved modules):

```bash
cd $ROOT
grep -rl "from app\.\(agents\|business_logic\|tools\|skills\|services\|middlewares\)\b" --include="*.py" apps/agents-service packages/agents-core/src | while read -r f; do
  sed -i '' \
    -e "s|from app\.agents|from agents_core.agents|g" \
    -e "s|from app\.business_logic|from agents_core.business_logic|g" \
    -e "s|from app\.tools|from agents_core.tools|g" \
    -e "s|from app\.skills|from agents_core.skills|g" \
    -e "s|from app\.services|from agents_core.services|g" \
    -e "s|from app\.middlewares|from agents_core.middlewares|g" \
    "$f"
done
```

Also check for any `from worker.` imports (the worker modules reference each other, and anything outside `worker/` that imports from it):

```bash
grep -rln "from worker\.\|^import worker\." --include="*.py" $ROOT/apps/agents-service $ROOT/packages/agents-core/src
```

For each match, rewrite `from worker.` → `from agents_core.worker.` and `import worker.` → `import agents_core.worker.`:

```bash
grep -rl "from worker\.\|^import worker\." --include="*.py" $ROOT/apps/agents-service $ROOT/packages/agents-core/src | while read -r f; do
  sed -i '' -e "s|from worker\.|from agents_core.worker.|g" -e "s|^import worker\.|import agents_core.worker.|g" "$f"
done
```

- [ ] **Step 3: Verify no stale references remain**

```bash
grep -rl "from app\.\(agents\|business_logic\|tools\|skills\|services\|middlewares\)\b\|from worker\." --include="*.py" $ROOT/apps/agents-service $ROOT/packages/agents-core/src
```

Expected: no output.

- [ ] **Step 4: Fix the worker process entrypoint scripts**

`apps/agents-service/package.json` (confirmed during planning) has:

```json
"dev:worker": "uv run python -m worker.consumer",
"dev:scheduler": "uv run python -m worker.scheduler",
```

These are invoked by the root `package.json`'s `"dev": "turbo run dev dev:worker dev:scheduler --parallel"` and `"dev:agents"` scripts. Update both module paths:

```json
"dev:worker": "uv run python -m agents_core.worker.consumer",
"dev:scheduler": "uv run python -m agents_core.worker.scheduler",
```

Leave the rest of `apps/agents-service/package.json` (`dev`, `install`, `format`, `lint`, `test` scripts) unchanged.

- [ ] **Step 5: Sync and verify**

```bash
cd $ROOT && uv sync
cd $ROOT/apps/agents-service && uv run python -c "from agents_core.agents.agent_factory import *; from agents_core.business_logic import chat; from agents_core.worker import broker; print('ok')"
```

Expected: prints `ok`. (Adjust the exact symbols imported if `agent_factory.py` or `business_logic/chat.py` don't export something importable via `*` cleanly — the point of this check is confirming the modules import without error, not exercising specific symbols; a plain `import agents_core.agents.agent_factory` etc. works equally well as the verification if `import *` complains.)

- [ ] **Step 6: Run the test suite**

```bash
cd $ROOT/apps/agents-service && uv run --extra dev pytest -x
```

Expected: passes.

- [ ] **Step 7: Commit**

```bash
cd $ROOT
git add -A
git commit -m "feat: move agents, business_logic, tools, skills, services, middlewares, worker into packages/agents-core

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Move `routes` into `packages/agents-core`, wire `create_app()` to the package, finalize `apps/agents-service`, verify end-to-end

**Files:**
- Move: `apps/agents-service/app/routes/` → `packages/agents-core/src/agents_core/routes/`
- Modify: `apps/agents-service/app/__init__.py`

- [ ] **Step 1: Move the directory**

```bash
git -C $ROOT mv apps/agents-service/app/routes packages/agents-core/src/agents_core/routes
```

- [ ] **Step 2: Rewrite internal references inside the moved routes**

```bash
cd $ROOT/packages/agents-core/src/agents_core/routes
grep -rl "from app\." --include="*.py" .
```

For each match, rewrite `from app.X` → `from agents_core.X` (covers any remaining references to the sibling modules moved in Tasks 8–9):

```bash
grep -rl "from app\." --include="*.py" . | while read -r f; do
  sed -i '' -E "s|from app\.([a-z_]+)|from agents_core.\1|g" "$f"
done
```

- [ ] **Step 3: Update `apps/agents-service/app/__init__.py`'s blueprint imports**

Current content imports blueprints like:

```python
from app.routes.agents import bp as agents_bp
from app.routes.approval import bp as approval_bp
from app.routes.auth import bp as auth_bp
from app.routes.chat import bp as chat_bp
from app.routes.connectors import bp as connectors_bp
from app.routes.github import bp as github_bp
from app.routes.projects import bp as projects_bp
from app.routes.rag import bp as rag_bp
from app.routes.scheduled_tasks import bp as scheduled_tasks_bp
from app.routes.skills import bp as skills_bp
from app.routes.stripe import bp as stripe_bp
from app.routes.teams import bp as teams_bp
from app.routes.usage import bp as usage_bp
from app.routes.users import bp as users_bp
```

Rewrite every `from app.routes.` to `from agents_core.routes.`:

```bash
cd $ROOT/apps/agents-service
sed -i '' "s|from app\.routes\.|from agents_core.routes.|g" app/__init__.py
```

- [ ] **Step 4: Verify `app/__init__.py`'s remaining imports are all either stdlib, third-party, or already-rewritten `agents_core.*`/`configs.*`**

```bash
grep -n "^from\|^import" $ROOT/apps/agents-service/app/__init__.py
```

Confirm every `from app.` is gone (should only see `from agents_core...` and `from configs...` for first-party imports, plus stdlib/third-party ones like `sentry_sdk`, `flasgger`, `flask`, `flask_cors`).

- [ ] **Step 5: Check whether `apps/agents-service/app/` is now just `__init__.py`**

```bash
ls $ROOT/apps/agents-service/app/
```

Expected: just `__init__.py` (everything else moved across Tasks 8–10). This is expected and fine — `app/` is now purely the assembly module.

- [ ] **Step 6: Sync and boot the app**

```bash
cd $ROOT && uv sync
cd $ROOT/apps/agents-service && uv run python -c "from app import create_app; from configs import Config; app = create_app(Config); print('app created:', app.name)"
```

Expected: prints `app created: app` (or similar) with no import errors — this exercises the full `create_app()` factory, which now pulls every blueprint from `agents_core.routes`.

- [ ] **Step 7: Run the full test suite**

```bash
cd $ROOT/apps/agents-service && uv run --extra dev pytest
```

Expected: full suite passes, not just `-x` fail-fast as in earlier tasks — this is the first point where every moved module is wired together.

- [ ] **Step 8: Commit**

```bash
cd $ROOT
git add -A
git commit -m "feat: move routes into packages/agents-core, complete backend extraction

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: Final end-to-end verification across the whole monorepo

**Files:** none new — this task only verifies Tasks 1–10.

- [ ] **Step 1: Full monorepo build via Turbo**

```bash
cd $ROOT && npm run build
```

Expected: succeeds for every workspace package that has a `build` task (currently just `apps/frontend`, per `turbo.json`'s existing config — `packages/ui` and `packages/core` have no `build` script, which is intentional, since they're consumed as raw TS source via `transpilePackages`, not pre-compiled).

- [ ] **Step 2: Full lint**

```bash
cd $ROOT && npm run lint
```

Expected: same baseline as before this plan — no new errors introduced by any of the moves.

- [ ] **Step 3: Full test suite across all workspaces**

```bash
cd $ROOT && npm run test
```

Expected: passes for `apps/frontend`, `packages/ui`, `packages/core`.

```bash
cd $ROOT/apps/agents-service && uv run --extra dev pytest
```

Expected: passes.

- [ ] **Step 4: Confirm nothing anywhere still references a now-moved old path**

```bash
cd $ROOT
grep -rl "@/components/ui/\|@/components/shared/\|@/components/chat\|@/components/dashboard\|@/components/settings\|@/components/auth\|@/components/desktop\|@/components/scheduled-tasks\|@/hooks/\|@/services/\|@/types/\|@/utils/common\|@/lib/\|@/agents/\|@/constants/routes\|@/constants/stream-events\|@/configs/billing" \
  --include="*.ts" --include="*.tsx" apps packages | grep -v node_modules
```

Expected: no output.

```bash
grep -rl "from app\.\(models\|schemas\|constants\|enum\|types\|utils\|tool_helpers\|file_to_process\|agents\|business_logic\|tools\|skills\|services\|middlewares\|routes\)\b\|from worker\." --include="*.py" apps packages
```

Expected: no output.

- [ ] **Step 5: Confirm `apps/frontend` and `apps/agents-service` directory listings match the plan's intent**

```bash
find $ROOT/apps/frontend -maxdepth 1 -type d
find $ROOT/apps/agents-service -maxdepth 1 -type d
find $ROOT/apps/agents-service/app -maxdepth 1 -type f
```

Expected: `apps/frontend` top level has `app/`, `public/`, plus config files — no `components/`, `hooks/`, `services/`, `types/`, `lib/`, `utils/`, `agents/` (all moved). `apps/agents-service` has `app/` (now just `__init__.py`), `alembic/`, `configs/`, `scripts/`, plus `app.py`/`wsgi.py` — no `worker/` at the top level (moved into the package).

- [ ] **Step 6: Final commit (if anything changed during verification)**

If Steps 1–5 required any fixes, commit them:

```bash
cd $ROOT
git add -A
git status --short
```

If there's anything staged, commit it:

```bash
git commit -m "fix: address issues found in end-to-end package-extraction verification

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

If nothing changed (all verification passed clean), skip the commit.

**Do not push this branch** — hand back to the user for review once this task completes. Pushing, opening a PR, and the follow-on work (publishing packages, flipping the repo public, building vertical apps) are separate decisions out of scope for this plan.

---

## Self-review notes

- **Spec coverage:** Every section of the spec maps to a task — `packages/ui` (Tasks 1–3), `packages/core` (Tasks 4–6), the `uv` workspace + `packages/agents-core` (Tasks 7–10), final verification (Task 11). The spec's "explicitly out of scope" items (publishing, making the repo public, vertical apps) are not tasks here, matching the spec.
- **Always-buildable constraint:** Verified each task's boundary — no task leaves `apps/frontend` or `apps/agents-service` in a broken state when it ends. Tasks 5 and 8 specifically call out *why* the partial state mid-sequence is still valid (not-yet-moved code still resolves against not-yet-moved local files).
- **Dependency accuracy:** All package.json/pyproject.toml dependency lists were built from actual `grep` output against the real moving directories during planning (including a second pass specifically for dynamic `import()` calls on the TS side, which caught `@monaco-editor/react` and `xlsx` that a naive static-import grep would have missed), not assumed from memory.
- **Correctness details locked in during planning, not guessed:** npm workspaces use plain version-string dependencies (not `workspace:*`, which is pnpm/yarn-only and would error under npm); `uv` workspace members are declared via `{ workspace = true }` sources; Tailwind v4 needs explicit `@source` directives to scan workspace-linked packages since its default content detection skips `node_modules`.
