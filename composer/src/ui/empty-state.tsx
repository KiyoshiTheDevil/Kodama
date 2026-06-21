// -- Interfaces ----------------------------------------------------------------

interface EmptyStateProps {
  message: string;
  hint: string;
  action?: React.ReactNode;
}

// -- Components ----------------------------------------------------------------

const EmptyState: React.FC<EmptyStateProps> = ({ message, hint, action }) => (
  <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center">
    <p className="text-lg text-composer-text-secondary">{message}</p>
    <p className="text-sm text-composer-text-muted">{hint}</p>
    {action}
  </div>
);

// -- Exports -------------------------------------------------------------------

export { EmptyState };
