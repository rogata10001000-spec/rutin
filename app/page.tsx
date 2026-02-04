import { redirect } from "next/navigation";

export default function HomePage() {
  // ルートへのアクセスは /login へリダイレクト
  redirect("/login");
}
