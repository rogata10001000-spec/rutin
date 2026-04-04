"use client";

import { useEffect, useState, useTransition } from "react";
import { getTodayProgress, type TodayProgress } from "@/actions/progress";

export function TodayProgressBar() {
  const [progress, setProgress] = useState<TodayProgress | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await getTodayProgress();
      if (result.ok) {
        setProgress(result.data);
      }
    });
  }, []);

  if (!progress || progress.total === 0) return null;

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="font-medium text-stone-500 whitespace-nowrap">
        今日 {progress.replied}/{progress.total}人
      </span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-stone-200">
        <div
          className={`h-full rounded-full transition-all ${
            progress.percentage >= 80
              ? "bg-green-500"
              : progress.percentage >= 50
              ? "bg-amber-500"
              : "bg-red-500"
          }`}
          style={{ width: `${progress.percentage}%` }}
        />
      </div>
      <span
        className={`font-bold ${
          progress.percentage >= 80
            ? "text-green-600"
            : progress.percentage >= 50
            ? "text-amber-600"
            : "text-red-600"
        }`}
      >
        {progress.percentage}%
      </span>
    </div>
  );
}
