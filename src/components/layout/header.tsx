interface HeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function Header({ title, description, actions }: HeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-6 mt-2 lg:mt-0">
      <div className="min-w-0">
        <h1 className="text-lg sm:text-2xl font-bold text-text truncate">{title}</h1>
        {description && <p className="text-muted text-xs sm:text-sm mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex gap-2 shrink-0 flex-wrap">{actions}</div>}
    </div>
  );
}
