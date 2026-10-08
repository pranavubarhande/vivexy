import Image from 'next/image';
import { Check } from 'lucide-react';

const HIGHLIGHTS = [
  'Agents that work across your documents and tools',
  'Scheduled automations with full chat history',
  'Bring your own model keys, track every token',
];

export function AuthSplitLayout({
  children,
  appName,
}: {
  children: React.ReactNode;
  appName: string;
}) {
  return (
    <div className="min-h-screen bg-background md:grid md:grid-cols-[1.05fr_1fr]">
      {/* Mobile only: slim top bar, logo + app name, no tagline -- keeps
          brand presence without pushing the form below the fold. */}
      <div className="flex items-center gap-2 px-4 py-3 md:hidden">
        <Image
          src="/logo.png"
          alt={appName}
          width={24}
          height={24}
          className="rounded-sm object-contain shrink-0"
        />
        <span className="font-semibold text-lg">{appName}</span>
      </div>

      {/* Desktop only: full brand panel */}
      <div className="relative m-3 hidden flex-col justify-between overflow-hidden rounded-4xl bg-night p-10 text-white md:flex lg:p-14">
        {/* Ambient lime glow + dotted texture */}
        <div className="pointer-events-none absolute -left-32 -top-32 size-112 rounded-full bg-lime/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-20 size-96 rounded-full bg-lime/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgb(255_255_255/0.07)_1px,transparent_1px)] bg-size-[22px_22px] mask-[linear-gradient(to_bottom,black,transparent_75%)]" />

        <div className="relative flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <Image
              src="/logo.png"
              alt={appName}
              width={20}
              height={20}
              className="object-contain invert"
            />
          </span>
          <span className="font-semibold text-lg tracking-tight">
            {appName}
          </span>
        </div>

        <div className="relative max-w-md">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70 backdrop-blur">
            <span className="size-1.5 rounded-full bg-lime" />
            Built for legal, finance & compliance
          </span>
          <h2 className="font-serif text-5xl leading-[1.05] tracking-tight lg:text-6xl">
            AI Workspaces for Professional Teams
          </h2>
          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map((item) => (
              <li
                key={item}
                className="flex items-center gap-3 text-sm text-white/70"
              >
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-lime text-lime-foreground">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/40">
          &copy; {new Date().getFullYear()} {appName}
        </p>
      </div>

      {/* Form panel -- shared by both mobile and desktop */}
      <div className="flex items-center justify-center px-4 py-10 md:px-10 md:py-12">
        <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
          {children}
        </div>
      </div>
    </div>
  );
}
