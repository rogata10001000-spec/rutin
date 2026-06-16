"use client";

import { useEffect, useState } from "react";
import { CANCEL_REASON_CODES } from "@/schemas/subscription-management";

type ReasonCode = (typeof CANCEL_REASON_CODES)[number];

const REASON_LABELS: Record<ReasonCode, string> = {
  price: "料金が高い",
  no_effect: "効果を実感できなかった",
  no_time: "時間が取れなかった",
  cast_mismatch: "担当メイトと合わなかった",
  dissatisfied: "サービスに不満があった",
  other: "その他",
};

type DowngradeOption = {
  label: string;
  monthlyPrice: number;
} | null;

type CancelDeflectionModalProps = {
  open: boolean;
  downgradeOption: DowngradeOption;
  renewalDateLabel: string | null;
  busy: boolean;
  onClose: () => void;
  onPause: () => void;
  onDowngrade: () => void;
  onConfirmCancel: (reasonCode: ReasonCode | null, reasonDetail: string) => void;
};

const formatYen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

export function CancelDeflectionModal({
  open,
  downgradeOption,
  renewalDateLabel,
  busy,
  onClose,
  onPause,
  onDowngrade,
  onConfirmCancel,
}: CancelDeflectionModalProps) {
  const [step, setStep] = useState<"retain" | "reason">("retain");
  const [reasonCode, setReasonCode] = useState<ReasonCode | null>(null);
  const [reasonDetail, setReasonDetail] = useState("");

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setStep("retain");
      setReasonCode(null);
      setReasonDetail("");
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="fixed inset-0 bg-stone-900/30 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div
        className="relative z-50 flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-soft-lg ring-1 ring-stone-900/5 sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
      >
        {step === "retain" ? (
          <>
            <div className="border-b border-stone-100 bg-stone-50/50 px-6 py-4">
              <h3 className="text-lg font-bold text-stone-800">解約前に少しだけ</h3>
              <p className="mt-1 text-sm text-stone-500">あなたに合う続け方があるかもしれません。</p>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div className="rounded-2xl border border-sage/40 bg-sage/10 p-4">
                <p className="text-sm font-bold text-stone-800">いったん「一時停止」できます</p>
                <p className="mt-1 text-xs leading-relaxed text-stone-600">
                  解約せずに請求だけストップ。落ち着いたら、いつでも同じ担当メイトで再開できます。今の記録やつながりはそのまま残ります。
                </p>
                <button
                  type="button"
                  onClick={onPause}
                  disabled={busy}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-sage px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:brightness-95 disabled:opacity-50"
                >
                  {busy ? "処理中..." : "一時停止する"}
                </button>
              </div>

              {downgradeOption && (
                <div className="rounded-2xl border border-terracotta/30 bg-terracotta/5 p-4">
                  <p className="text-sm font-bold text-stone-800">
                    もっと気軽な「{downgradeOption.label}」はいかがですか？
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-600">
                    月額{formatYen(downgradeOption.monthlyPrice)}で、つながりを保ったまま続けられます。負担を抑えて再開のきっかけを残せます。
                  </p>
                  <button
                    type="button"
                    onClick={onDowngrade}
                    disabled={busy}
                    className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-terracotta px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#d0694e] disabled:opacity-50"
                  >
                    {busy ? "変更中..." : `${downgradeOption.label}に変更する`}
                  </button>
                </div>
              )}

              <div className="rounded-2xl border border-stone-200 bg-white p-4">
                <p className="text-sm font-bold text-stone-800">担当メイトはあなたの味方です</p>
                <p className="mt-1 text-xs leading-relaxed text-stone-600">
                  うまくいかない時こそ、一度メッセージで相談してみませんか。続け方の工夫を一緒に考えます。
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="inline-flex w-full items-center justify-center rounded-full bg-stone-800 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
              >
                このまま続ける
              </button>

              <button
                type="button"
                onClick={() => setStep("reason")}
                disabled={busy}
                className="w-full text-center text-xs font-medium text-stone-400 underline-offset-2 hover:text-stone-600 hover:underline disabled:opacity-50"
              >
                それでも解約手続きに進む
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="border-b border-stone-100 bg-stone-50/50 px-6 py-4">
              <h3 className="text-lg font-bold text-stone-800">差し支えなければ理由を</h3>
              <p className="mt-1 text-sm text-stone-500">
                今後の改善に役立てます（任意）。
                {renewalDateLabel ? `${renewalDateLabel}まではご利用いただけます。` : ""}
              </p>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-6 py-5">
              {CANCEL_REASON_CODES.map((code) => {
                const selected = reasonCode === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setReasonCode(code)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                      selected
                        ? "border-terracotta bg-terracotta/10 font-bold text-terracotta"
                        : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        selected ? "border-terracotta" : "border-stone-300"
                      }`}
                    >
                      {selected && <span className="h-2 w-2 rounded-full bg-terracotta" />}
                    </span>
                    {REASON_LABELS[code]}
                  </button>
                );
              })}

              {reasonCode === "cast_mismatch" && (
                <p className="rounded-xl bg-sage/10 px-4 py-2.5 text-xs leading-relaxed text-stone-600">
                  担当メイトの変更も承れます。「このまま続ける」で戻り、メイトにご相談ください。
                </p>
              )}

              <textarea
                value={reasonDetail}
                onChange={(e) => setReasonDetail(e.target.value)}
                rows={3}
                placeholder="ご意見があればお聞かせください（任意）"
                className="mt-1 block w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
              />
            </div>

            <div className="flex gap-3 border-t border-stone-100 bg-stone-50/50 px-6 py-4">
              <button
                type="button"
                onClick={() => setStep("retain")}
                disabled={busy}
                className="rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50"
              >
                戻る
              </button>
              <button
                type="button"
                onClick={() => onConfirmCancel(reasonCode, reasonDetail)}
                disabled={busy}
                className="flex-1 rounded-full border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                {busy ? "処理中..." : "解約を確定する"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
