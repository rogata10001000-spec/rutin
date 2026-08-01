/**
 * 画像アップロード前のブラウザ側での縮小・再圧縮。
 *
 * 体感速度のための処理。スマホで撮った写真は 3〜5MB あり、そのまま Server Action に
 * 流すと送信だけで数秒かかる（回線が細いほど致命的）。表示側は大きくても 800px 程度なので、
 * 長辺 1600px / WebP 品質 0.82 に落とすと多くの場合 100〜300KB になり、送信時間が1桁縮む。
 *
 * ブラウザ専用（canvas を使う）。サーバー側からは呼ばない。
 */

/** サーバー側の受け入れ上限と揃える（actions/cast-photos.ts）。 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** サーバー側の許可 MIME と揃える。 */
const COMPRESSIBLE_TYPES = ["image/jpeg", "image/png", "image/webp"];

type CompressOptions = {
  /** 長辺の最大ピクセル数 */
  maxEdge?: number;
  /** 0〜1 の圧縮品質 */
  quality?: number;
};

/**
 * 画像を縮小・再圧縮した File を返す。
 * 圧縮できない形式・デコード失敗・圧縮しても小さくならない場合は元の File をそのまま返す
 * （＝この関数が原因でアップロードが失敗することはない）。
 */
export async function compressImageFile(
  file: File,
  { maxEdge = 1600, quality = 0.82 }: CompressOptions = {}
): Promise<File> {
  if (typeof document === "undefined") return file;
  if (!COMPRESSIBLE_TYPES.includes(file.type)) return file;

  try {
    const bitmap = await decode(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);
    if ("close" in bitmap) bitmap.close();

    // WebP を優先（透過を保持したまま最も小さくなる）。非対応環境では JPEG にフォールバックする。
    let blob = await toBlob(canvas, "image/webp", quality);
    if (!blob || blob.type !== "image/webp") {
      // JPEG は透過を扱えないため、白で塗りつぶしてから描き直す（透過部分が黒くなるのを防ぐ）。
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      blob = await toBlob(canvas, "image/jpeg", quality);
    }

    // 圧縮しても小さくならないなら元のまま送る（小さな画像を無駄に再エンコードしない）。
    if (!blob || blob.size >= file.size) return file;

    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.${ext}`, {
      type: blob.type,
      lastModified: file.lastModified,
    });
  } catch {
    // デコードできない形式（HEIC 等）はそのまま送り、サーバー側の検証メッセージに任せる。
    return file;
  }
}

/** EXIF の回転情報を反映してデコードする（スマホの縦写真が横倒しになるのを防ぐ）。 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image decode failed"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
