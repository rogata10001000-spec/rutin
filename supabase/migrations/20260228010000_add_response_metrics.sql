-- レスポンスメトリクス: 返信時間の記録と分析
CREATE TABLE response_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  end_user_id uuid NOT NULL REFERENCES end_users(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES staff_profiles(id),
  user_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  reply_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  response_minutes int NOT NULL,
  plan_code text NOT NULL,
  sla_minutes int NOT NULL,
  sla_breached boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_response_metrics_staff ON response_metrics (staff_id, created_at DESC);
CREATE INDEX idx_response_metrics_end_user ON response_metrics (end_user_id, created_at DESC);
CREATE INDEX idx_response_metrics_created ON response_metrics (created_at DESC);

-- メッセージテンプレート
CREATE TABLE message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  staff_id uuid REFERENCES staff_profiles(id) ON DELETE SET NULL,
  is_global boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_message_templates_category ON message_templates (category, sort_order);

-- RLS for response_metrics
ALTER TABLE response_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read response_metrics" ON response_metrics
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Staff can insert response_metrics" ON response_metrics
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- RLS for message_templates
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read message_templates" ON message_templates
  FOR SELECT TO authenticated
  USING (staff_id = auth.uid() OR is_global = true);

CREATE POLICY "Staff can insert own templates" ON message_templates
  FOR INSERT TO authenticated
  WITH CHECK (staff_id = auth.uid() AND is_global = false);

CREATE POLICY "Staff can update own templates" ON message_templates
  FOR UPDATE TO authenticated
  USING (staff_id = auth.uid() AND is_global = false)
  WITH CHECK (staff_id = auth.uid() AND is_global = false);

CREATE POLICY "Staff can delete own templates" ON message_templates
  FOR DELETE TO authenticated
  USING (staff_id = auth.uid() AND is_global = false);

CREATE POLICY "Admin can manage all templates" ON message_templates
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_profiles
      WHERE staff_profiles.id = auth.uid()
      AND staff_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff_profiles
      WHERE staff_profiles.id = auth.uid()
      AND staff_profiles.role = 'admin'
    )
  );
