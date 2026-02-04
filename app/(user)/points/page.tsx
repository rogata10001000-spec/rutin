"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getPointProducts, getUserPointBalance, createPointCheckoutSession } from "@/actions/gifts";

type PointProduct = {
  id: string;
  name: string;
  points: number;
  price: number;
};

export default function PointsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const canceled = searchParams.get("canceled") === "true";

  const [products, setProducts] = useState<PointProduct[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("認証トークンがありません");
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const [productsResult, balanceResult] = await Promise.all([
          getPointProducts(),
          getUserPointBalance({ token }),
        ]);

        if (productsResult.ok) {
          setProducts(productsResult.data.items);
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

  const handlePurchase = async (productId: string) => {
    setPurchasing(productId);
    setError(null);

    try {
      const result = await createPointCheckoutSession({
        token,
        productId,
      });

      if (result.ok) {
        router.push(result.data.checkoutUrl);
      } else {
        setError(result.error.message);
      }
    } catch {
      setError("購入処理に失敗しました");
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  return (
    <div>
      {canceled && (
        <div className="mb-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-700">
          購入がキャンセルされました
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ポイント残高 */}
      {balance !== null && (
        <div className="mb-6 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 p-6 text-white">
          <p className="text-sm opacity-90">現在のポイント残高</p>
          <p className="text-4xl font-bold">{balance.toLocaleString()} pt</p>
        </div>
      )}

      {/* 商品一覧 */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">ポイントを購入</h2>
        {products.map((product) => (
          <div
            key={product.id}
            className="flex items-center justify-between rounded-lg border bg-white p-4"
          >
            <div>
              <p className="font-medium text-gray-900">{product.name}</p>
              <p className="text-2xl font-bold text-blue-600">
                {product.points.toLocaleString()} pt
              </p>
            </div>
            <button
              onClick={() => handlePurchase(product.id)}
              disabled={purchasing === product.id}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {purchasing === product.id
                ? "処理中..."
                : `¥${product.price.toLocaleString()}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
