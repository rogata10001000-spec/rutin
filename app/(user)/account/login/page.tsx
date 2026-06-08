import { EmailLoginForm } from "@/components/user/EmailLoginForm";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function AccountLoginPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const error = params.error;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-900">ログイン</h1>
        <p className="mt-1 text-sm leading-relaxed text-stone-500">
          メールアドレスでログインして、契約内容の確認・プラン変更・解約を行えます。
        </p>
      </div>

      {error === "expired" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ログインリンクの有効期限が切れているか、すでに使用済みです。もう一度お試しください。
        </div>
      )}
      {error === "invalid" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ログインリンクが正しくありません。もう一度お試しください。
        </div>
      )}

      <EmailLoginForm />

      <p className="px-1 text-xs leading-relaxed text-stone-400">
        LINEをご利用の方は、LINEのメニューからもアクセスできます。
      </p>
    </div>
  );
}
