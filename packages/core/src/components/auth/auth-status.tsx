import { Loader2 } from 'lucide-react';

/** Full-screen centered status card used by email verification and OAuth. */
export function AuthStatus({
  icon,
  title,
  description,
  action,
  pending,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  pending?: boolean;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute left-1/2 top-1/3 size-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime/20 blur-3xl" />
      <div className="relative w-full max-w-md rounded-3xl border border-border/80 bg-card p-10 text-center shadow-xl animate-in fade-in zoom-in-95 duration-300">
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-lime text-lime-foreground [&_svg]:size-6">
          {pending ? <Loader2 className="animate-spin" /> : icon}
        </div>
        <h1 className="font-serif text-3xl tracking-tight">{title}</h1>
        {description && (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
        {action && <div className="mt-8">{action}</div>}
      </div>
    </div>
  );
}
