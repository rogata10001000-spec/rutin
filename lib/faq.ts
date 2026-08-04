import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export type PublicFaqItem = {
  id: string;
  question: string;
  answer: string;
};

/**
 * 公開ページ(/help)に表示するよくある質問。
 * active=true のみを sort_order 順で返す。取得失敗時は空配列
 * （FAQの障害でヘルプページ全体を落とさない。空のときはセクションごと非表示にする）。
 */
export async function getPublicFaqItems(): Promise<PublicFaqItem[]> {
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("faq_items")
      .select("id, question, answer")
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      logger.error("faq: public fetch failed", { error: error.message });
      return [];
    }
    return data ?? [];
  } catch (err) {
    logger.error("faq: unexpected public fetch error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
