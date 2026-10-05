import Image from 'next/image';

export function AuthSplitLayout({
  children,
  appName,
}: {
  children: React.ReactNode;
  appName: string;
}) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-2">
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
      <div className="hidden md:flex flex-col justify-between bg-primary-900 text-primary-foreground p-10">
        <div className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt={appName}
            width={28}
            height={28}
            className="rounded-sm object-contain shrink-0"
          />
          <span className="font-semibold text-lg">{appName}</span>
        </div>
        <p className="font-serif text-3xl leading-snug max-w-sm">
          AI Workspaces for Professional Teams
        </p>
        <p className="text-sm opacity-70">
          &copy; {new Date().getFullYear()} {appName}
        </p>
      </div>

      {/* Form panel -- shared by both mobile and desktop */}
      <div className="flex items-center justify-center px-4 py-10 md:py-0">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
