"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getNextUnrepliedUser, type NextUnrepliedUser } from "@/actions/progress";

type NextUserButtonProps = {
  currentUserId: string;
};

export function NextUserButton({ currentUserId }: NextUserButtonProps) {
  const router = useRouter();
  const [nextUser, setNextUser] = useState<NextUnrepliedUser | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await getNextUnrepliedUser(currentUserId);
      if (result.ok && result.data.user) {
        setNextUser(result.data.user);
      }
    });
  }, [currentUserId]);

  if (!nextUser) return null;

  return (
    <button
      onClick={() => router.push(`/chat/${nextUser.id}`)}
      className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 shadow-sm hover:bg-stone-50 hover:text-stone-800 transition-colors"
    >
      <span>次: {nextUser.nickname}</span>
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
