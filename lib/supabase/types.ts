// Supabase Database Types
// supabase gen types typescript で自動生成されるべきだが、
// 開発初期は手動で定義

export type StaffRole = "admin" | "supervisor" | "cast";
export type PlanCode = "light" | "standard" | "premium";
export type SubscriptionStatus = "trial" | "active" | "past_due" | "paused" | "canceled" | "incomplete";
export type CheckinStatus = "circle" | "triangle" | "cross";
export type MessageDirection = "in" | "out";
export type AiDraftType = "empathy" | "praise" | "suggest";
export type RiskStatus = "open" | "ack" | "resolved";
export type SettlementStatus = "draft" | "approved" | "paid";
export type WebhookProvider = "line" | "stripe";
export type PointReason = "purchase" | "gift_redeem" | "refund" | "chargeback" | "admin_adjust";
export type RevenueEventType = "gift_redeem" | "subscription_monthly" | "refund" | "chargeback" | "breakage";
export type PayoutRuleType = "gift_share" | "subscription_share";
export type PayoutScopeType = "global" | "cast" | "cast_gift" | "cast_gift_category" | "cast_plan";

// Row types
type StaffProfileRow = {
  id: string;
  role: StaffRole;
  display_name: string;
  active: boolean;
  capacity_limit: number | null;
  style_summary: string | null;
  style_updated_at: string | null;
  accepting_new_users: boolean;
  created_at: string;
};

type PlansRow = {
  plan_code: string;
  name: string;
  reply_sla_minutes: number;
  sla_warning_minutes: number;
  daily_checkin_enabled: boolean;
  weekly_review_enabled: boolean;
  priority_level: number;
  capacity_weight: number;
  active: boolean;
};

type EndUsersRow = {
  id: string;
  line_user_id: string;
  nickname: string;
  birthday: string | null;
  status: SubscriptionStatus;
  plan_code: string;
  assigned_cast_id: string | null;
  paused_priority_penalty: number;
  tags: string[];
  trial_end_at: string | null;
  created_at: string;
  updated_at: string;
};

type CastAssignmentsRow = {
  id: string;
  end_user_id: string;
  from_cast_id: string | null;
  to_cast_id: string;
  reason: string | null;
  shadow_until: string | null;
  created_by: string;
  created_at: string;
};

type MessagesRow = {
  id: string;
  end_user_id: string;
  direction: MessageDirection;
  body: string;
  line_message_id: string | null;
  sent_by_staff_id: string | null;
  sent_as_proxy: boolean;
  proxy_for_cast_id: string | null;
  created_at: string;
};

type CheckinsRow = {
  id: string;
  end_user_id: string;
  date: string;
  status: CheckinStatus;
  created_at: string;
  updated_at: string;
};

type MemosRow = {
  id: string;
  end_user_id: string;
  category: string;
  pinned: boolean;
  latest_body: string;
  updated_at: string;
};

type MemoRevisionsRow = {
  id: string;
  memo_id: string;
  body: string;
  edited_by: string;
  created_at: string;
};

type SubscriptionsRow = {
  id: string;
  end_user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  status: SubscriptionStatus;
  plan_code: string;
  applied_stripe_price_id: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
};

type AuditLogsRow = {
  id: string;
  actor_staff_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  success: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
};

type WebhookEventsRow = {
  id: string;
  provider: WebhookProvider;
  event_id: string;
  event_type: string;
  received_at: string;
  processed_at: string | null;
  success: boolean;
  error_message: string | null;
};

type TaxRatesRow = {
  id: string;
  name: string;
  rate: number;
  effective_from: string;
  active: boolean;
};

type PointProductsRow = {
  id: string;
  name: string;
  points: number;
  price_excl_tax_jpy: number;
  tax_rate_id: string;
  price_incl_tax_jpy: number;
  stripe_price_id: string;
  active: boolean;
  created_at: string;
};

type GiftCatalogRow = {
  id: string;
  name: string;
  category: string;
  cost_points: number;
  icon: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
};

type UserPointLedgerRow = {
  id: string;
  end_user_id: string;
  delta_points: number;
  reason: PointReason;
  ref_type: string;
  ref_id: string;
  created_at: string;
};

type GiftSendsRow = {
  id: string;
  end_user_id: string;
  cast_id: string;
  gift_id: string;
  cost_points: number;
  sent_at: string;
  message_id: string | null;
};

type RevenueEventsRow = {
  id: string;
  event_type: RevenueEventType;
  end_user_id: string;
  cast_id: string | null;
  occurred_on: string;
  amount_excl_tax_jpy: number;
  tax_rate_id: string;
  tax_jpy: number;
  amount_incl_tax_jpy: number;
  source_ref_type: string;
  source_ref_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

type PayoutRulesRow = {
  id: string;
  rule_type: PayoutRuleType;
  scope_type: PayoutScopeType;
  cast_id: string | null;
  gift_id: string | null;
  gift_category: string | null;
  plan_code: string | null;
  percent: number;
  effective_from: string;
  effective_to: string | null;
  active: boolean;
  created_by: string;
  created_at: string;
};

type PayoutCalculationsRow = {
  id: string;
  revenue_event_id: string;
  cast_id: string;
  rule_id: string;
  percent_snapshot: number;
  amount_jpy: number;
  calculated_at: string;
  settlement_batch_id: string | null;
};

type SettlementBatchesRow = {
  id: string;
  period_from: string;
  period_to: string;
  status: SettlementStatus;
  total_amount_jpy: number;
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
};

type SettlementItemsRow = {
  id: string;
  batch_id: string;
  cast_id: string;
  amount_jpy: number;
  breakdown: Record<string, unknown>;
  created_at: string;
};

type AiDraftRequestsRow = {
  id: string;
  end_user_id: string;
  requested_by: string;
  jst_date: string;
  context_snapshot: Record<string, unknown>;
  success: boolean;
  error_message: string | null;
  created_at: string;
};

type AiDraftsRow = {
  id: string;
  request_id: string;
  type: AiDraftType;
  body: string;
  created_at: string;
};

type ShadowDraftsRow = {
  id: string;
  end_user_id: string;
  created_by: string;
  body: string;
  created_at: string;
};

type BirthdayCongratsRow = {
  id: string;
  end_user_id: string;
  year: number;
  sent_by: string;
  sent_at: string;
};

type RiskFlagsRow = {
  id: string;
  end_user_id: string;
  detected_on_message_id: string | null;
  risk_level: number;
  reasons: string[];
  status: RiskStatus;
  created_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
};

type PlanPricesRow = {
  id: string;
  plan_code: string;
  currency: string;
  amount_monthly: number;
  stripe_price_id: string;
  valid_from: string;
  active: boolean;
  created_at: string;
};

type CastPlanPriceOverridesRow = {
  id: string;
  cast_id: string;
  plan_code: string;
  currency: string;
  amount_monthly: number;
  stripe_price_id: string;
  valid_from: string;
  active: boolean;
  created_at: string;
};

type CastPhotosRow = {
  id: string;
  cast_id: string;
  storage_path: string;
  display_order: number;
  caption: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export interface Database {
  public: {
    Tables: {
      staff_profiles: {
        Row: StaffProfileRow;
        Insert: Omit<StaffProfileRow, "created_at" | "style_summary" | "style_updated_at"> & {
          style_summary?: string | null;
          style_updated_at?: string | null;
        };
        Update: Partial<Omit<StaffProfileRow, "created_at">>;
        Relationships: [];
      };
      plans: {
        Row: PlansRow;
        Insert: PlansRow;
        Update: Partial<PlansRow>;
        Relationships: [];
      };
      end_users: {
        Row: EndUsersRow;
        Insert: Omit<EndUsersRow, "id" | "created_at" | "updated_at" | "paused_priority_penalty" | "tags" | "birthday" | "trial_end_at" | "assigned_cast_id"> & {
          id?: string;
          paused_priority_penalty?: number;
          tags?: string[];
          birthday?: string | null;
          trial_end_at?: string | null;
          assigned_cast_id?: string | null;
        };
        Update: Partial<Omit<EndUsersRow, "id" | "created_at">>;
        Relationships: [];
      };
      cast_assignments: {
        Row: CastAssignmentsRow;
        Insert: Omit<CastAssignmentsRow, "id" | "created_at" | "shadow_until"> & {
          id?: string;
          shadow_until?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      messages: {
        Row: MessagesRow;
        Insert: Omit<MessagesRow, "id" | "created_at" | "sent_as_proxy" | "line_message_id" | "proxy_for_cast_id" | "sent_by_staff_id"> & {
          id?: string;
          sent_as_proxy?: boolean;
          line_message_id?: string | null;
          proxy_for_cast_id?: string | null;
          sent_by_staff_id?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      checkins: {
        Row: CheckinsRow;
        Insert: Omit<CheckinsRow, "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Pick<CheckinsRow, "status">>;
        Relationships: [];
      };
      memos: {
        Row: MemosRow;
        Insert: Omit<MemosRow, "id" | "updated_at" | "pinned"> & {
          id?: string;
          pinned?: boolean;
        };
        Update: Partial<Omit<MemosRow, "id" | "end_user_id">>;
        Relationships: [];
      };
      memo_revisions: {
        Row: MemoRevisionsRow;
        Insert: Omit<MemoRevisionsRow, "id" | "created_at"> & { id?: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      subscriptions: {
        Row: SubscriptionsRow;
        Insert: Omit<SubscriptionsRow, "id" | "created_at" | "updated_at" | "cancel_at_period_end" | "current_period_end"> & {
          id?: string;
          cancel_at_period_end?: boolean;
          current_period_end?: string | null;
        };
        Update: Partial<Omit<SubscriptionsRow, "id" | "end_user_id" | "created_at">>;
        Relationships: [];
      };
      audit_logs: {
        Row: AuditLogsRow;
        Insert: Omit<AuditLogsRow, "id" | "created_at"> & { id?: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      webhook_events: {
        Row: WebhookEventsRow;
        Insert: Omit<WebhookEventsRow, "id" | "received_at" | "success" | "processed_at" | "error_message"> & {
          id?: string;
          success?: boolean;
          processed_at?: string | null;
          error_message?: string | null;
        };
        Update: Partial<Pick<WebhookEventsRow, "processed_at" | "success" | "error_message">>;
        Relationships: [];
      };
      tax_rates: {
        Row: TaxRatesRow;
        Insert: Omit<TaxRatesRow, "id"> & { id?: string };
        Update: Partial<Omit<TaxRatesRow, "id">>;
        Relationships: [];
      };
      point_products: {
        Row: PointProductsRow;
        Insert: Omit<PointProductsRow, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<PointProductsRow, "id" | "created_at">>;
        Relationships: [];
      };
      gift_catalog: {
        Row: GiftCatalogRow;
        Insert: Omit<GiftCatalogRow, "id" | "created_at" | "sort_order"> & {
          id?: string;
          sort_order?: number;
        };
        Update: Partial<Omit<GiftCatalogRow, "id" | "created_at">>;
        Relationships: [];
      };
      user_point_ledger: {
        Row: UserPointLedgerRow;
        Insert: Omit<UserPointLedgerRow, "id" | "created_at"> & { id?: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      gift_sends: {
        Row: GiftSendsRow;
        Insert: Omit<GiftSendsRow, "id" | "sent_at" | "message_id"> & {
          id?: string;
          message_id?: string | null;
        };
        Update: Partial<Pick<GiftSendsRow, "message_id">>;
        Relationships: [];
      };
      revenue_events: {
        Row: RevenueEventsRow;
        Insert: Omit<RevenueEventsRow, "id" | "created_at" | "metadata"> & {
          id?: string;
          metadata?: Record<string, unknown>;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      payout_rules: {
        Row: PayoutRulesRow;
        Insert: Omit<PayoutRulesRow, "id" | "created_at" | "gift_id" | "gift_category" | "plan_code" | "effective_to"> & {
          id?: string;
          gift_id?: string | null;
          gift_category?: string | null;
          plan_code?: string | null;
          effective_to?: string | null;
        };
        Update: Partial<Pick<PayoutRulesRow, "active" | "effective_to">>;
        Relationships: [];
      };
      payout_calculations: {
        Row: PayoutCalculationsRow;
        Insert: Omit<PayoutCalculationsRow, "id" | "calculated_at" | "settlement_batch_id"> & {
          id?: string;
          settlement_batch_id?: string | null;
        };
        Update: Partial<Pick<PayoutCalculationsRow, "settlement_batch_id">>;
        Relationships: [];
      };
      settlement_batches: {
        Row: SettlementBatchesRow;
        Insert: Omit<SettlementBatchesRow, "id" | "created_at" | "approved_by" | "approved_at" | "paid_at" | "total_amount_jpy"> & {
          id?: string;
          total_amount_jpy?: number;
        };
        Update: Partial<Pick<SettlementBatchesRow, "status" | "approved_by" | "approved_at" | "paid_at">>;
        Relationships: [];
      };
      settlement_items: {
        Row: SettlementItemsRow;
        Insert: Omit<SettlementItemsRow, "id" | "created_at"> & { id?: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      ai_draft_requests: {
        Row: AiDraftRequestsRow;
        Insert: Omit<AiDraftRequestsRow, "id" | "created_at"> & { id?: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      ai_drafts: {
        Row: AiDraftsRow;
        Insert: Omit<AiDraftsRow, "id" | "created_at"> & { id?: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      shadow_drafts: {
        Row: ShadowDraftsRow;
        Insert: Omit<ShadowDraftsRow, "id" | "created_at"> & { id?: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      birthday_congrats: {
        Row: BirthdayCongratsRow;
        Insert: Omit<BirthdayCongratsRow, "id" | "sent_at"> & { id?: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      risk_flags: {
        Row: RiskFlagsRow;
        Insert: Omit<RiskFlagsRow, "id" | "created_at" | "resolved_by" | "resolved_at"> & {
          id?: string;
        };
        Update: Partial<Pick<RiskFlagsRow, "status" | "resolved_by" | "resolved_at">>;
        Relationships: [];
      };
      plan_prices: {
        Row: PlanPricesRow;
        Insert: Omit<PlanPricesRow, "id" | "created_at" | "currency"> & {
          id?: string;
          currency?: string;
        };
        Update: Partial<Pick<PlanPricesRow, "active" | "stripe_price_id" | "amount_monthly" | "valid_from">>;
        Relationships: [];
      };
      cast_plan_price_overrides: {
        Row: CastPlanPriceOverridesRow;
        Insert: Omit<CastPlanPriceOverridesRow, "id" | "created_at" | "currency"> & {
          id?: string;
          currency?: string;
        };
        Update: Partial<Pick<CastPlanPriceOverridesRow, "active">>;
        Relationships: [];
      };
      cast_photos: {
        Row: CastPhotosRow;
        Insert: Omit<CastPhotosRow, "id" | "created_at" | "updated_at" | "active" | "display_order"> & {
          id?: string;
          active?: boolean;
          display_order?: number;
        };
        Update: Partial<Pick<CastPhotosRow, "storage_path" | "display_order" | "caption" | "active">>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_current_staff_role: {
        Args: Record<string, never>;
        Returns: StaffRole | null;
      };
      is_admin_or_supervisor: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_assigned_to_user: {
        Args: { user_id: string };
        Returns: boolean;
      };
      is_shadow_for_user: {
        Args: { user_id: string };
        Returns: boolean;
      };
      check_cast_photos_limit: {
        Args: { p_cast_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
