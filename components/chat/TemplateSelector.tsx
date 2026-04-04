"use client";

import { useState, useEffect, useTransition } from "react";
import { getMessageTemplates, type MessageTemplate } from "@/actions/templates";

type TemplateSelectorProps = {
  onSelect: (body: string) => void;
};

export function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [isPending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(false);

  const loadTemplates = () => {
    if (loaded) {
      setOpen(!open);
      return;
    }

    startTransition(async () => {
      const result = await getMessageTemplates();
      if (result.ok) {
        setTemplates(result.data.templates);
        setLoaded(true);
      }
      setOpen(true);
    });
  };

  const categories = [...new Set(templates.map((t) => t.category))];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={loadTemplates}
        className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 shadow-sm hover:bg-stone-50 transition-colors"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
        テンプレート
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-2 w-72 max-h-80 overflow-y-auto rounded-xl border border-stone-200 bg-white shadow-lg">
            {isPending ? (
              <div className="p-4 text-center text-sm text-stone-400">
                読み込み中...
              </div>
            ) : templates.length === 0 ? (
              <div className="p-4 text-center text-sm text-stone-400">
                テンプレートがありません
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {categories.map((cat) => (
                  <div key={cat}>
                    <div className="px-3 py-2 text-xs font-bold text-stone-500 uppercase tracking-wide bg-stone-50">
                      {cat}
                    </div>
                    {templates
                      .filter((t) => t.category === cat)
                      .map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => {
                            onSelect(template.body);
                            setOpen(false);
                          }}
                          className="w-full px-3 py-2.5 text-left hover:bg-stone-50 transition-colors"
                        >
                          <p className="text-sm font-medium text-stone-800">
                            {template.title}
                          </p>
                          <p className="mt-0.5 text-xs text-stone-500 line-clamp-2">
                            {template.body}
                          </p>
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
