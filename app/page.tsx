import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // ログイン状態とロールに応じて着地先を振り分ける。
  // - 未ログイン: /login
  // - メイト: 受信トレイ
  // - 管理者/SV: ダッシュボード
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  if (staff.role === "cast") redirect("/inbox");
  redirect("/admin");
}
