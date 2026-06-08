import { LiffMyPageClient } from "@/components/liff/LiffMyPageClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "契約マイページ",
  robots: { index: false, follow: false },
};

export default function LiffMyPage() {
  return <LiffMyPageClient />;
}
