"use client";

export function UserHeader() {
  return (
    <header className="border-b border-stone-100 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto max-w-lg px-4">
        <div className="flex h-14 items-center justify-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-terracotta text-sm font-bold text-white shadow-sm">
            R
          </span>
          <span className="text-xl font-bold tracking-tight text-stone-800">Rutin</span>
        </div>
      </div>
    </header>
  );
}
