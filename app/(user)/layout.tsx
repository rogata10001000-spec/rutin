import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserFromRequest, verifyUserToken } from "@/lib/auth";
import { UserHeader } from "@/components/user/UserHeader";

export default async function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // トークンはクエリパラメータまたはCookieから取得
  const headersList = await headers();
  const url = headersList.get("x-url") ?? "";
  const token = new URL(url, "http://localhost").searchParams.get("token");

  // トークン検証（基本的にはクライアント側で処理）
  // ここではレイアウトの表示のみ行う

  return (
    <div className="min-h-screen bg-gray-50">
      <UserHeader />
      <main className="py-6">
        <div className="mx-auto max-w-lg px-4">
          {children}
        </div>
      </main>
    </div>
  );
}
