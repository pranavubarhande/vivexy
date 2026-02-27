interface DashboardHeaderProps {
  heading: string;
  text?: string;
  children?: React.ReactNode;
}

export function DashboardHeader({ heading, children }: DashboardHeaderProps) {
  return (
    <header className="flex py-4 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      {children && <div className="ml-auto px-4">{children}</div>}
    </header>
  );
}
