import { notFound } from "next/navigation";
import { getChatThread } from "@/actions/chat";
import { getCurrentStaff } from "@/lib/auth";
import { ChatContainer } from "@/components/chat/ChatContainer";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await getCurrentStaff();

  if (!staff) {
    notFound();
  }

  const result = await getChatThread({ endUserId: id });

  if (!result.ok) {
    if (result.error.code === "NOT_FOUND" || result.error.code === "FORBIDDEN") {
      notFound();
    }
    return (
      <div className="p-4 text-center text-red-600">{result.error.message}</div>
    );
  }

  return (
    <ChatContainer
      endUserId={id}
      initialMessages={result.data.messages}
      sideInfo={result.data.sideInfo}
      staffRole={staff.role}
      staffId={staff.id}
    />
  );
}
