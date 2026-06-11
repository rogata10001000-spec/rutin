"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  LineAccountListItem,
  CastOptionItem,
} from "@/actions/admin/line-accounts";
import { toggleLineAccountActive } from "@/actions/admin/line-accounts";
import { UpsertLineAccountDialog } from "./UpsertLineAccountDialog";
import { useToast } from "@/components/common/Toast";

const PencilIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const PlusIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const CopyIcon = () => (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="h-3.5 w-3.5 text-sage" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

type LineAccountsTableProps = {
  items: LineAccountListItem[];
  castOptions: CastOptionItem[];
  encryptionConfigured: boolean;
};

export function LineAccountsTable({
  items,
  castOptions,
  encryptionConfigured,
}: LineAccountsTableProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [editItem, setEditItem] = useState<LineAccountListItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const openNew = () => {
    setEditItem(null);
    setDialogOpen(true);
  };

  const openEdit = (item: LineAccountListItem) => {
    setEditItem(item);
    setDialogOpen(true);
  };

  const handleToggle = (id: string) => {
    startTransition(async () => {
      const result = await toggleLineAccountActive(id);
      if (result.ok) {
        showToast("状態を切り替えました", "success");
        router.refresh();
      } else {
        showToast(result.error.message, "error");
      }
    });
  };

  const handleCopy = async (item: LineAccountListItem) => {
    try {
      await navigator.clipboard.writeText(item.webhookUrl);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showToast("コピーに失敗しました", "error");
    }
  };

  return (
    <>
      <div className="mb-6 flex justify-end">
        <button
          onClick={openNew}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-terracotta px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-[#d0694e] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-terracotta focus:ring-offset-2"
        >
          <PlusIcon />
          アカウントを追加
        </button>
      </div>

      {items.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="min-w-[920px] divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50">
              <tr>
                <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  アカウント
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  担当メイト
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  資格情報
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  Webhook URL
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  状態
                </th>
                <th className="w-px whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 bg-white">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={`transition-colors hover:bg-stone-50/50 ${!item.active ? "bg-stone-50/30" : ""}`}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-stone-900">{item.name}</span>
                      {item.isDefault && (
                        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                          共通
                        </span>
                      )}
                    </div>
                    {item.channelId && (
                      <p className="mt-0.5 text-xs text-stone-400">CH: {item.channelId}</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-stone-600">
                    {item.isDefault ? "—" : item.castName ?? "未紐づけ"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    <div className="flex flex-col gap-1">
                      <span
                        className={`inline-flex w-fit items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          item.hasAccessToken
                            ? "bg-sage/20 text-sage-800"
                            : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        Token {item.hasAccessToken ? "設定済" : "未設定"}
                      </span>
                      <span
                        className={`inline-flex w-fit items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          item.hasChannelSecret
                            ? "bg-sage/20 text-sage-800"
                            : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        Secret {item.hasChannelSecret ? "設定済" : "未設定"}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <code className="block max-w-[280px] truncate rounded bg-stone-100 px-2 py-1 text-xs text-stone-600">
                        {item.webhookUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopy(item)}
                        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-stone-200 px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50"
                      >
                        {copiedId === item.id ? <CheckIcon /> : <CopyIcon />}
                        {copiedId === item.id ? "コピー済" : "コピー"}
                      </button>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        item.active
                          ? "bg-sage/20 text-sage-800"
                          : "bg-stone-100 text-stone-500"
                      }`}
                    >
                      {item.active ? "有効" : "無効"}
                    </span>
                  </td>
                  <td className="w-px whitespace-nowrap px-5 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-stone-200 px-3 py-1.5 text-sm font-semibold text-terracotta hover:bg-stone-50"
                      >
                        <PencilIcon />
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggle(item.id)}
                        disabled={isPending}
                        className="inline-flex items-center whitespace-nowrap rounded-full border border-stone-200 px-3 py-1.5 text-sm font-semibold text-stone-500 hover:bg-stone-50 disabled:opacity-50"
                      >
                        {item.active ? "無効化" : "有効化"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-medium text-stone-900">
            LINE公式アカウントが登録されていません
          </p>
          <p className="mt-1 text-sm text-stone-500">
            メイト個別アカウントを追加してください。未登録時は環境変数の共通アカウントが使われます。
          </p>
        </div>
      )}

      <UpsertLineAccountDialog
        open={dialogOpen}
        editItem={editItem}
        castOptions={castOptions}
        encryptionConfigured={encryptionConfigured}
        onClose={() => setDialogOpen(false)}
      />

      <ToastContainer />
    </>
  );
}
