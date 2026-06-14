"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type SelectOption = {
  value: string;
  label: ReactNode;
  /** 選択不可（見出し代わり等）。 */
  disabled?: boolean;
};

type Size = "sm" | "md";

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

const triggerBaseClass =
  "inline-flex w-full items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white font-medium text-stone-700 shadow-sm transition-colors hover:bg-stone-50 focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta disabled:cursor-not-allowed disabled:opacity-50";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-stone-500 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

type DropdownPosition = { top: number; left: number; width: number };

/**
 * トリガー要素の直下にポータルでドロップダウンを描画するためのフック。
 * overflow-hidden/overflow-x-auto なコンテナでもクリップされない。
 */
function useDropdown(open: boolean, triggerRef: React.RefObject<HTMLElement | null>) {
  const [position, setPosition] = useState<DropdownPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, triggerRef]);

  return position;
}

function DropdownMenu({
  position,
  children,
  menuRef,
}: {
  position: DropdownPosition | null;
  children: ReactNode;
  menuRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (typeof document === "undefined" || !position) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="listbox"
      tabIndex={-1}
      style={{ top: position.top, left: position.left, minWidth: position.width }}
      className="fixed z-[60] max-h-72 overflow-auto rounded-xl border border-stone-200 bg-white py-1 shadow-soft-lg ring-1 ring-stone-900/5 focus:outline-none"
    >
      {children}
    </div>,
    document.body
  );
}

// =====================================================
// Select（単一選択）
// =====================================================

export type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** トリガーボタンに付与する追加クラス。 */
  className?: string;
  id?: string;
  size?: Size;
  "aria-label"?: string;
};

export function Select({
  value,
  onChange,
  options,
  placeholder = "選択してください",
  disabled = false,
  className = "",
  id,
  size = "md",
  "aria-label": ariaLabel,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const position = useDropdown(open, triggerRef);
  const reactId = useId();
  const listboxId = id ?? reactId;

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={listboxId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className={`${triggerBaseClass} ${sizeClasses[size]} ${className}`}
      >
        <span className={`truncate ${selected ? "" : "text-stone-400"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <DropdownMenu position={position} menuRef={menuRef}>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  isSelected
                    ? "bg-terracotta/10 font-bold text-terracotta"
                    : "text-stone-700 hover:bg-stone-50"
                }`}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && (
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </DropdownMenu>
      )}
    </>
  );
}

// =====================================================
// MultiSelect（複数選択）
// =====================================================

export type MultiSelectProps = {
  values: string[];
  onChange: (values: string[]) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  size?: Size;
  "aria-label"?: string;
};

export function MultiSelect({
  values,
  onChange,
  options,
  placeholder = "選択してください",
  disabled = false,
  className = "",
  id,
  size = "md",
  "aria-label": ariaLabel,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const position = useDropdown(open, triggerRef);
  const reactId = useId();
  const listboxId = id ?? reactId;

  const selectedLabels = options.filter((o) => values.includes(o.value)).map((o) => o.label);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = (optionValue: string) => {
    if (values.includes(optionValue)) {
      onChange(values.filter((v) => v !== optionValue));
    } else {
      onChange([...values, optionValue]);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={listboxId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className={`${triggerBaseClass} ${sizeClasses[size]} ${className}`}
      >
        <span className={`truncate ${selectedLabels.length > 0 ? "" : "text-stone-400"}`}>
          {selectedLabels.length === 0
            ? placeholder
            : selectedLabels.length <= 2
              ? selectedLabels.map((l, i) => <span key={i}>{i > 0 ? "、" : ""}{l}</span>)
              : `${selectedLabels.length}件選択中`}
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <DropdownMenu position={position} menuRef={menuRef}>
          {options.map((option) => {
            const isSelected = values.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  toggle(option.value);
                }}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  isSelected ? "font-bold text-terracotta" : "text-stone-700 hover:bg-stone-50"
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    isSelected ? "border-terracotta bg-terracotta text-white" : "border-stone-300 bg-white"
                  }`}
                >
                  {isSelected && (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </DropdownMenu>
      )}
    </>
  );
}
