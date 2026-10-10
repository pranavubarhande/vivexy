interface DashboardHeaderProps {
  heading: string;
  text?: string;
  children?: React.ReactNode;
}

/** Mobile-only top bar; on desktop each page renders its own PageHeader. */
export function DashboardHeader({ heading, children }: DashboardHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-3 md:hidden">
      {children}
      <span className="text-sm font-medium">{heading}</span>
    </header>
  );
}
