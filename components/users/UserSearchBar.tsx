"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback } from "react";

type UserSearchBarProps = {
  currentQuery: string;
};

export function UserSearchBar({ currentQuery }: UserSearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(currentQuery);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const params = new URLSearchParams(searchParams.toString());
      if (query) {
        params.set("q", query);
      } else {
        params.delete("q");
      }
      router.push(`/users?${params.toString()}`);
    },
    [query, router, searchParams]
  );

  return (
    <form onSubmit={handleSearch} className="flex gap-2 w-full max-w-md">
      <div className="relative flex-1">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <svg className="h-5 w-5 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ニックネームで検索..."
          className="block w-full rounded-xl border-stone-200 bg-white pl-10 pr-3 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta placeholder-stone-400"
        />
      </div>
      <button
        type="submit"
        className="rounded-xl bg-terracotta px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#d0694e] focus:outline-none focus:ring-2 focus:ring-terracotta focus:ring-offset-2 transition-all"
      >
        検索
      </button>
    </form>
  );
}
