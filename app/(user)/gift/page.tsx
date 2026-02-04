"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  getGiftCatalog,
  getUserPointBalance,
  sendGift,
  type GiftCatalogItem,
} from "@/actions/gifts";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

export default function GiftPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [gifts, setGifts] = useState<GiftCatalogItem[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedGift, setSelectedGift] = useState<GiftCatalogItem | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("認証トークンがありません");
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const [giftsResult, balanceResult] = await Promise.all([
          getGiftCatalog(),
          getUserPointBalance({ token }),
        ]);

        if (giftsResult.ok) {
          setGifts(giftsResult.data.items);
        }
        if (balanceResult.ok) {
          setBalance(balanceResult.data.balance);
        } else {
          setError(balanceResult.error.message);
        }
      } catch {
        setError("データの取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  const handleSelectGift = (gift: GiftCatalogItem) => {
    if (balance !== null && balance < gift.costPoints) {
      setError("ポイントが不足しています");
      return;
    }
    setSelectedGift(gift);
    setConfirmOpen(true);
  };

  const handleSendGift = async () => {
    if (!selectedGift) return;

    setSending(true);
    setError(null);

    try {
      const result = await sendGift({
        token,
        giftId: selectedGift.id,
      });

      if (result.ok) {
        setSuccess(true);
        setBalance((prev) =>
          prev !== null ? prev - selectedGift.costPoints : null
        );
      } else {
        setError(result.error.message);
      }
    } catch {
      setError("送信に失敗しました");
    } finally {
      setSending(false);
      setConfirmOpen(false);
      setSelectedGift(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <div className="mb-4 rounded-full bg-pink-100 p-4">
          <span className="text-5xl">{selectedGift?.icon ?? "🎁"}</span>
        </div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          ギフトを送りました！
        </h1>
        <p className="mb-6 text-gray-600">
          キャストに感謝の気持ちが届きました
        </p>
        <button
          onClick={() => setSuccess(false)}
          className="text-blue-600 hover:text-blue-800"
        >
          他のギフトを見る
        </button>
      </div>
    );
  }

  // カテゴリごとにグループ化
  const groupedGifts = gifts.reduce<Record<string, GiftCatalogItem[]>>(
    (acc, gift) => {
      const category = gift.category ?? "その他";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(gift);
      return acc;
    },
    {}
  );

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-400 hover:text-red-600"
          >
            ×
          </button>
        </div>
      )}

      {/* ポイント残高 */}
      {balance !== null && (
        <div className="mb-6 rounded-lg bg-gradient-to-r from-pink-500 to-rose-500 p-4 text-white">
          <p className="text-sm opacity-90">ポイント残高</p>
          <p className="text-3xl font-bold">{balance.toLocaleString()} pt</p>
        </div>
      )}

      {/* ギフト一覧 */}
      <div className="space-y-6">
        {Object.entries(groupedGifts).map(([category, categoryGifts]) => (
          <div key={category}>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              {category}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {categoryGifts.map((gift) => {
                const isDisabled =
                  balance !== null && balance < gift.costPoints;
                return (
                  <button
                    key={gift.id}
                    onClick={() => handleSelectGift(gift)}
                    disabled={isDisabled}
                    className={`flex flex-col items-center rounded-lg border bg-white p-4 transition-colors ${
                      isDisabled
                        ? "cursor-not-allowed opacity-50"
                        : "hover:border-pink-300 hover:bg-pink-50"
                    }`}
                  >
                    <span className="mb-2 text-4xl">{gift.icon ?? "🎁"}</span>
                    <span className="mb-1 text-sm font-medium text-gray-900">
                      {gift.name}
                    </span>
                    <span className="text-sm font-bold text-pink-600">
                      {gift.costPoints.toLocaleString()} pt
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 確認ダイアログ */}
      <ConfirmDialog
        open={confirmOpen}
        title="ギフトを送る"
        description={
          selectedGift
            ? `${selectedGift.icon ?? "🎁"} ${selectedGift.name}（${selectedGift.costPoints}pt）を送りますか？`
            : ""
        }
        confirmLabel="送る"
        variant="default"
        onConfirm={handleSendGift}
        onCancel={() => {
          setConfirmOpen(false);
          setSelectedGift(null);
        }}
        loading={sending}
      />
    </div>
  );
}
