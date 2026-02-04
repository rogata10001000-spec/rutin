"use client";

import { useState } from "react";
import { generateAiDrafts, type AiDraft } from "@/actions/ai";

type AiDraftButtonProps = {
  endUserId: string;
  onSelectDraft: (body: string) => void;
};

const draftTypeLabels = {
  empathy: "共感",
  praise: "称賛",
  suggest: "提案",
};

const draftTypeColors = {
  empathy: "bg-pink-50 border-pink-100 hover:bg-pink-100 text-pink-900",
  praise: "bg-yellow-50 border-yellow-100 hover:bg-yellow-100 text-yellow-900",
  suggest: "bg-blue-50 border-blue-100 hover:bg-blue-100 text-blue-900",
};

export function AiDraftButton({ endUserId, onSelectDraft }: AiDraftButtonProps) {
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<AiDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setDrafts(null);

    try {
      const result = await generateAiDrafts({ endUserId });
      if (result.ok) {
        setDrafts(result.data.drafts);
      } else {
        setError(result.error.message);
      }
    } catch {
      setError("生成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDraft = (body: string) => {
    onSelectDraft(body);
    setDrafts(null);
  };

  return (
    <div className="relative">
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-sm font-bold text-stone-700 shadow-sm hover:bg-stone-50 disabled:opacity-50 transition-all"
      >
        <span className="text-lg">✨</span>
        {loading ? "生成中..." : "AI下書き"}
      </button>

      {/* エラー表示 */}
      {error && (
        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600 shadow-soft-lg">
          <div className="flex justify-between items-start">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-2 text-red-400 hover:text-red-600"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* 下書き候補 */}
      {drafts && drafts.length > 0 && (
        <div className="absolute bottom-full left-0 mb-2 w-80 rounded-2xl border border-stone-200 bg-white p-4 shadow-soft-lg z-10">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold text-stone-700">AI下書き候補</span>
            <button
              onClick={() => setDrafts(null)}
              className="text-stone-400 hover:text-stone-600"
            >
              ×
            </button>
          </div>
          <div className="space-y-2">
            {drafts.map((draft, i) => (
              <button
                key={i}
                onClick={() => handleSelectDraft(draft.body)}
                className={`w-full rounded-xl border p-3 text-left text-sm transition-all ${draftTypeColors[draft.type]}`}
              >
                <span className="mb-1 block text-xs font-bold opacity-70">
                  {draftTypeLabels[draft.type]}
                </span>
                <p className="leading-relaxed">{draft.body}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
