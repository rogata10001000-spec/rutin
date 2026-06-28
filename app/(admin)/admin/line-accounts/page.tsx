import { getLineAccounts } from "@/actions/admin/line-accounts";
import { LineAccountSetupGuide } from "@/components/admin/line-accounts/LineAccountSetupGuide";
import { LineAccountsTable } from "@/components/admin/line-accounts/LineAccountsTable";

export const dynamic = "force-dynamic";

export default async function LineAccountsPage() {
  const result = await getLineAccounts();

  if (!result.ok) {
    return (
      <div className="rounded-xl bg-red-50 p-4 text-center text-red-600 border border-red-100">
        {result.error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">
          LINE公式アカウント
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          共通(Routine)アカウントとメイト個別アカウントを管理します。各チャネルの Webhook URL を
          LINE Developers コンソールに設定してください。
        </p>
      </div>

      {!result.data.encryptionConfigured && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm font-medium text-amber-800">
          暗号化鍵（LINE_TOKEN_ENC_KEY）が未設定です。チャネルシークレット・アクセストークンの保存にはこの環境変数が必要です。
          <code className="ml-1 rounded bg-amber-100 px-1.5 py-0.5">openssl rand -base64 32</code>
          で生成してください。
        </div>
      )}

      <LineAccountSetupGuide />

      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-soft">
        <LineAccountsTable
          items={result.data.items}
          castOptions={result.data.castOptions}
          encryptionConfigured={result.data.encryptionConfigured}
        />
      </div>
    </div>
  );
}
