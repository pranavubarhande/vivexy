import * as React from 'react';

import { cn } from '../../utils/common';

/** Centered, width-capped column used by every dashboard page. */
function PageContainer({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<'div'> & { size?: 'default' | 'narrow' | 'wide' }) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-1 pt-6 pb-16 sm:px-4 md:pt-10',
        size === 'narrow' && 'max-w-3xl',
        size === 'default' && 'max-w-6xl',
        size === 'wide' && 'max-w-7xl',
        className
      )}
      {...props}
    />
  );
}

interface PageHeaderProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

/** Eyebrow + serif title + description, with actions aligned right. */
function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        className
      )}
      {...props}
    >
      <div className="min-w-0 space-y-2">
        {eyebrow && (
          <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-lime ring-2 ring-lime/30" />
            {eyebrow}
          </div>
        )}
        <h1 className="font-serif text-3xl font-normal leading-tight tracking-tight text-foreground md:text-[2.5rem]">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

interface EmptyStateProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

/** Dashed-border panel for "nothing here yet" states. */
function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed border-border bg-[radial-gradient(ellipse_at_top,var(--color-primary-50),transparent_60%)] px-6 py-16 text-center',
        className
      )}
      {...props}
    >
      {icon && (
        <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-border bg-background text-foreground shadow-sm [&_svg]:size-6">
          {icon}
        </div>
      )}
      <h3 className="font-serif text-2xl tracking-tight">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export { PageContainer, PageHeader, EmptyState };
