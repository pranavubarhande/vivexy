'use client';

import { useTheme } from 'next-themes';
import { cn } from '@vivexy/ui/utils';
import { Check } from 'lucide-react';

const themes = [
  {
    id: 'skin',
    label: 'Skin & Olive',
    description: 'Warm cream with olive green — the default editorial palette',
    bg: '#FFFCEB',
    primary: '#5E6738',
    accent: '#A8B57A',
  },
  {
    id: 'dark',
    label: 'Dark Olive',
    description: 'Deep olive dark mode — focused and easy on the eyes',
    bg: '#1E2212',
    primary: '#8FA05A',
    accent: '#5E6738',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    description: 'Cool blue tones for a calm, professional atmosphere',
    bg: '#F0F7FF',
    primary: '#1A6BAD',
    accent: '#5BA4D4',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Dark purple elegance for late-night work sessions',
    bg: '#0D0E1A',
    primary: '#8B78F0',
    accent: '#6655CC',
  },
  {
    id: 'stone',
    label: 'Stone',
    description: 'Warm neutral gray — understated and professional',
    bg: '#F7F5F0',
    primary: '#4A4540',
    accent: '#8A8278',
  },
];

export function ThemeSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground mb-4">
          Choose a color theme for the entire application. Changes apply
          immediately across all pages.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {themes.map((t) => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={cn(
              'relative flex flex-col gap-3 rounded-lg border-2 p-4 text-left transition-all hover:shadow-md',
              theme === t.id
                ? 'border-primary shadow-sm'
                : 'border-border hover:border-primary/40'
            )}
          >
            {theme === t.id && (
              <span className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3 w-3" />
              </span>
            )}
            {/* Color preview */}
            <div
              className="h-12 w-full rounded-md border border-black/10 overflow-hidden flex"
              style={{ backgroundColor: t.bg }}
            >
              <div
                className="w-1/3 h-full"
                style={{ backgroundColor: t.primary }}
              />
              <div
                className="w-1/6 h-full"
                style={{ backgroundColor: t.accent }}
              />
            </div>
            <div>
              <p className="font-medium text-sm">{t.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.description}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
