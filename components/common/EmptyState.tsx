"use client";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-6 rounded-full bg-stone-100 p-6">
        <svg
          className="h-10 w-10 text-stone-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
      </div>
      <h3 className="text-lg font-bold text-stone-800">{title}</h3>
      {description && (
        <p className="mt-2 text-sm text-stone-500 max-w-sm mx-auto">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 rounded-xl bg-terracotta px-5 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-[#d0694e] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-terracotta focus:ring-offset-2"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
