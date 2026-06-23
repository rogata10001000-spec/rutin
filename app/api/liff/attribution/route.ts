import { NextRequest, NextResponse } from "next/server";
import { verifyLineIdToken } from "@/lib/line-id-token";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordAcquisitionClick, sanitizeAcquisitionSource } from "@/lib/acquisition";

export const dynamic = "force-dynamic";

/**
 * LIFF入口で捕捉した公式LINEの流入元(src)を line_user_id に紐付けて記録する。
 * フロー: 各サイトの「LINEで始める」→ LIFF(?src=...) → ここに POST →
 *         follow時に end_users.acquisition_source へ first-touch で確定。
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const allowed = await checkRateLimit({
    key: `liff-attribution:ip:${ip}`,
    windowMs: 5 * 60 * 1000,
    maxRequests: 30,
  });
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: { idToken?: unknown; src?: unknown; landingUrl?: unknown; referrer?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const idToken = typeof body.idToken === "string" ? body.idToken : undefined;
  if (!idToken) {
    return NextResponse.json({ ok: false, error: "missing_id_token" }, { status: 400 });
  }

  const source = sanitizeAcquisitionSource(body.src);
  if (!source) {
    // src が無い/不正なら認証だけ通っても記録対象なし（200で握る・導線は継続）。
    return NextResponse.json({ ok: true, recorded: false });
  }

  const verified = await verifyLineIdToken(idToken);
  if (!verified) {
    return NextResponse.json({ ok: false, error: "verification_failed" }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  await recordAcquisitionClick(supabase, {
    lineUserId: verified.lineUserId,
    source,
    landingUrl: body.landingUrl,
    referrer: body.referrer,
  });

  return NextResponse.json({ ok: true, recorded: true });
}
