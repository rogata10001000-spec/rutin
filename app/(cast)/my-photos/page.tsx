import { getCurrentStaff } from "@/lib/auth";
import { getCastPhotos } from "@/actions/cast-photos";
import { PhotoEditor } from "@/components/cast/PhotoEditor";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MyPhotosPage() {
  const staff = await getCurrentStaff();

  if (!staff) {
    redirect("/login");
  }

  if (staff.role !== "cast") {
    redirect("/");
  }

  const photosResult = await getCastPhotos(staff.id);
  const photos = photosResult.ok ? photosResult.data.photos : [];

  return (
    <div>
      {/* ページヘッダー */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">マイ写真</h1>
        <p className="mt-1 text-sm text-gray-500">
          プロフィール写真を管理します。1枚目がサムネイルとして表示されます。
        </p>
      </div>

      {/* 写真エディター */}
      <div className="rounded-lg border bg-white p-6">
        <PhotoEditor
          castId={staff.id}
          castName={staff.displayName}
          initialPhotos={photos}
        />
      </div>
    </div>
  );
}
