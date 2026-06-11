import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// 旧チャット画面は受信トレイの分割ビューに統合。
// ディープリンク・通知などからのアクセスは /inbox?user=[id] へ転送する。
export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/inbox?user=${encodeURIComponent(id)}`);
}
