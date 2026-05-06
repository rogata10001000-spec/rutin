import { getCurrentStaff } from "@/lib/auth";
import { getCastPhotos } from "@/actions/cast-photos";
import { getMyCastProfile } from "@/actions/cast-profile";
import { CastProfileEditor } from "@/components/cast/CastProfileEditor";
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

  const [photosResult, profileResult] = await Promise.all([
    getCastPhotos(staff.id),
    getMyCastProfile(),
  ]);
  const photos = photosResult.ok ? photosResult.data.photos : [];
  const publicProfile = profileResult.ok ? profileResult.data.publicProfile : null;

  return (
    <div>
      {/* ページヘッダー */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">プロフィール管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          伴走メイト選択画面に表示される写真とプロフィール文を管理します。
        </p>
      </div>

      {/* プロフィール文エディター */}
      <div className="mb-6 rounded-lg border bg-white p-6">
        <CastProfileEditor initialPublicProfile={publicProfile} />
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
