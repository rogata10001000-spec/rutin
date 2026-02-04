import Link from "next/link";
import { getStaffDetail } from "@/actions/admin/staff";
import { getCastPhotos } from "@/actions/cast-photos";
import { PhotoEditor } from "@/components/cast/PhotoEditor";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function StaffPhotosPage({ params }: PageProps) {
  const { id } = await params;
  const staffResult = await getStaffDetail(id);

  if (!staffResult.ok) {
    return (
      <div className="p-4 text-center text-red-600">
        {staffResult.error.message}
      </div>
    );
  }

  const staff = staffResult.data.staff;

  // キャスト以外は写真管理不要
  if (staff.role !== "cast") {
    return (
      <div className="p-4 text-center">
        <p className="text-gray-600">
          キャストのみ写真管理が可能です。
        </p>
        <Link
          href="/admin/staff"
          className="mt-4 inline-flex text-sm font-medium text-primary hover:text-primary-dark"
        >
          キャスト一覧に戻る
        </Link>
      </div>
    );
  }

  const photosResult = await getCastPhotos(id);
  const photos = photosResult.ok ? photosResult.data.photos : [];

  return (
    <div>
      {/* ナビゲーション */}
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/admin/staff"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <span className="material-symbols-outlined text-[18px]">
            arrow_back
          </span>
          キャスト一覧
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-700">{staff.displayName}</span>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-900">写真管理</span>
      </div>

      {/* ページヘッダー */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">写真管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          {staff.displayName}のプロフィール写真を管理します
        </p>
      </div>

      {/* 写真エディター */}
      <div className="rounded-lg border bg-white p-6">
        <PhotoEditor
          castId={id}
          castName={staff.displayName}
          initialPhotos={photos}
        />
      </div>
    </div>
  );
}
