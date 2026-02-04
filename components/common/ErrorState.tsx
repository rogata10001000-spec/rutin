"use client";

type ErrorStateProps = {
  title?: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  retry?: () => void;
};

export function ErrorState({
  title = "エラーが発生しました",
  message,
  action,
  retry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 rounded-full bg-red-100 p-4">
        <svg
          className="h-8 w-8 text-red-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-gray-500">{message}</p>
      <div className="mt-4 flex gap-3">
        {retry && (
          <button
            onClick={retry}
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            再試行
          </button>
        )}
        {action && (
          <button
            onClick={action.onClick}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

// インラインエラー表示用の軽量コンポーネント
type InlineErrorProps = {
  message: string;
  retry?: () => void;
};

export function InlineError({ message, retry }: InlineErrorProps) {
  return (
    <div className="rounded-md bg-red-50 p-4">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-red-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="ml-3">
          <p className="text-sm font-medium text-red-800">{message}</p>
          {retry && (
            <button
              onClick={retry}
              className="mt-2 text-sm font-medium text-red-600 hover:text-red-500"
            >
              再試行 →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
