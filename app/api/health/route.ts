import { createAdminSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const startedAt = Date.now();
  const supabase = createAdminSupabaseClient();

  const { error } = await supabase.from("staff_profiles").select("id").limit(1);
  const healthy = !error;

  return Response.json(
    {
      ok: healthy,
      uptimeMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
      checks: {
        database: healthy ? "ok" : "error",
      },
      error: error?.message,
    },
    { status: healthy ? 200 : 503 }
  );
}
