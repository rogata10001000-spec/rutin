import { UserHeader } from "@/components/user/UserHeader";

export default async function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
