import { LiffStartClient } from "@/components/liff/LiffStartClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Rutin をはじめる",
  robots: { index: false, follow: false },
};

export default function LiffStartPage() {
  return <LiffStartClient />;
}
