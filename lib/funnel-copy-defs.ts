/**
 * 申込ファネルの編集可能文言の定義（単一の真実のソース）。
 *
 * - エンドユーザー画面: この defaultValue をフォールバックとして表示（DB行が無くても壊れない）
 * - 管理画面エディタ: この定義から編集フォームを自動生成（ラベル・グループ・登場順）
 * - バリデーション: vars に列挙した変数が編集後の文言から消えていたら保存をブロック
 *
 * サーバー・クライアント両方から import するため、このファイルは純データに保つ
 * （"server-only"・DBアクセス・env 参照を持ち込まない）。
 *
 * 注意: ここに文言を追加したら、消費側（画面 or LINE送信）の配線も同時に行うこと。
 * 定義だけ追加すると「編集できるのにどこにも反映されない」死んだ設定になる。
 */

export type FunnelCopyFieldType = "text" | "multiline" | "number" | "plan-select";

export type FunnelCopyDef = {
  key: string;
  /** 編集画面に表示する業務語ラベル */
  label: string;
  /** 画面タブ（編集画面のグルーピング） */
  screen: "cast" | "detail" | "plan" | "complete" | "line";
  /** 画面内の小見出し */
  group: string;
  defaultValue: string;
  fieldType: FunnelCopyFieldType;
  /**
   * 文言内で使える差し込み変数。デフォルト文言に含まれる変数は編集後も必須
   * （消えているとリンク切れ・情報欠落になるため保存をブロックする）。
   */
  vars?: string[];
  /** 補足説明（編集画面のヒント） */
  hint?: string;
  /**
   * 空欄にして「その文言を出さない」ことを許すか。
   * 案内バナー・補足注記など、消しても操作が成立するものだけ true にする。
   * ボタン・見出し・プラン名を空にすると押せない/読めないUIになるため既定は false。
   */
  emptiable?: boolean;
};

/** 変数の説明（編集画面のチップ表示に使う） */
export const FUNNEL_COPY_VAR_LABELS: Record<string, string> = {
  days: "トライアル日数（自動で入ります）",
  price: "価格（「月額¥6,980」の形で自動で入ります）",
  subscribeUrl: "申込ページのリンク（自動で入ります・削除不可）",
};

export const FUNNEL_COPY_DEFS: readonly FunnelCopyDef[] = [
  // ===== メイト選択 =====
  {
    key: "cast.nav.title",
    label: "画面タイトル",
    screen: "cast",
    group: "見出し",
    defaultValue: "伴走メイトを選ぶ",
    fieldType: "text",
  },
  {
    key: "cast.hero.title",
    label: "トライアル案内の見出し",
    screen: "cast",
    group: "トライアル案内",
    defaultValue: "{days}日間無料でお試し",
    fieldType: "text",
    vars: ["days"],
  },
  {
    key: "cast.hero.body",
    label: "トライアル案内の本文",
    screen: "cast",
    group: "トライアル案内",
    defaultValue:
      "気になる伴走メイトを選んで、まずは{days}日間無料でメッセージのやりとりを体験できます。いつでも解約可能です。",
    fieldType: "multiline",
    vars: ["days"],
  },
  {
    key: "cast.banner.noline.title",
    label: "LINE未連携バナーの見出し",
    screen: "cast",
    group: "案内バナー",
    defaultValue: "LINEからアクセスしてください",
    fieldType: "text",
    emptiable: true,
  },
  {
    key: "cast.banner.noline.body",
    label: "LINE未連携バナーの本文",
    screen: "cast",
    group: "案内バナー",
    defaultValue:
      "ご契約には、LINE公式アカウントから届く案内リンクからのアクセスが必要です。このまま伴走メイトを選ぶことはできますが、契約手続きには進めません。",
    fieldType: "multiline",
    emptiable: true,
  },
  {
    key: "cast.banner.canceled.title",
    label: "決済キャンセル時の見出し",
    screen: "cast",
    group: "案内バナー",
    defaultValue: "決済がキャンセルされました",
    fieldType: "text",
    emptiable: true,
  },
  {
    key: "cast.banner.canceled.body",
    label: "決済キャンセル時の本文",
    screen: "cast",
    group: "案内バナー",
    defaultValue: "伴走メイトとプランを選び直して、再度お手続きください。",
    fieldType: "multiline",
    emptiable: true,
  },
  {
    key: "cast.empty.filtered",
    label: "絞り込みで0件のときの文言",
    screen: "cast",
    group: "空の状態",
    defaultValue:
      "条件に合う伴走メイトが見つかりませんでした。フィルターを変えてみてください。",
    fieldType: "multiline",
  },
  {
    key: "cast.empty.none",
    label: "受付中メイトが0人のときの文言",
    screen: "cast",
    group: "空の状態",
    defaultValue:
      "現在、新規受付中の伴走メイトがいません。時間をおいて再度お試しください。",
    fieldType: "multiline",
  },
  {
    key: "cast.error.fetch",
    label: "一覧を取得できないときの文言",
    screen: "cast",
    group: "空の状態",
    defaultValue:
      "現在、伴走メイトの一覧を取得できません。時間をおいて再度お試しください。",
    fieldType: "multiline",
  },
  {
    key: "cast.scarcity.threshold",
    label: "「残り◯枠」バッジを出す残数",
    screen: "cast",
    group: "表示ルール",
    defaultValue: "5",
    fieldType: "number",
    hint: "受付枠の残りがこの人数以下になったメイトに「残り◯枠」を表示します",
  },

  // ===== メイト詳細 =====
  {
    key: "detail.profile.heading",
    label: "プロフィール欄の見出し",
    screen: "detail",
    group: "プロフィール",
    defaultValue: "プロフィール",
    fieldType: "text",
  },
  {
    key: "detail.profile.empty",
    label: "プロフィール未設定時の文言",
    screen: "detail",
    group: "プロフィール",
    defaultValue: "プロフィール文は準備中です。",
    fieldType: "text",
  },
  {
    key: "detail.cta",
    label: "申込へ進むボタン",
    screen: "detail",
    group: "ボタン",
    defaultValue: "この伴走メイトでプランを見る",
    fieldType: "text",
  },

  // ===== プラン選択 =====
  {
    key: "plan.nav.title",
    label: "画面タイトル",
    screen: "plan",
    group: "見出し",
    defaultValue: "プランを選ぶ",
    fieldType: "text",
  },
  {
    key: "plan.name.light",
    label: "ライトプランの名前",
    screen: "plan",
    group: "プラン名",
    defaultValue: "ライト",
    fieldType: "text",
  },
  {
    key: "plan.name.standard",
    label: "スタンダードプランの名前",
    screen: "plan",
    group: "プラン名",
    defaultValue: "スタンダード",
    fieldType: "text",
  },
  {
    key: "plan.name.premium",
    label: "プレミアムプランの名前",
    screen: "plan",
    group: "プラン名",
    defaultValue: "プレミアム",
    fieldType: "text",
  },
  {
    key: "plan.desc.light",
    label: "ライトの説明文",
    screen: "plan",
    group: "プラン説明",
    defaultValue: "気軽にメッセージで相談したい方向け",
    fieldType: "text",
  },
  {
    key: "plan.desc.standard",
    label: "スタンダードの説明文",
    screen: "plan",
    group: "プラン説明",
    defaultValue: "毎日のチェックインで継続的にサポート",
    fieldType: "text",
  },
  {
    key: "plan.desc.premium",
    label: "プレミアムの説明文",
    screen: "plan",
    group: "プラン説明",
    defaultValue: "優先返信と週次レビューで集中サポート",
    fieldType: "text",
  },
  {
    key: "plan.sla.light",
    label: "ライトの返信目安",
    screen: "plan",
    group: "返信目安",
    defaultValue: "24時間以内",
    fieldType: "text",
    hint: "表示のみ変わります。実際のSLA判定は「プラン設定」の分数で行われます",
  },
  {
    key: "plan.sla.standard",
    label: "スタンダードの返信目安",
    screen: "plan",
    group: "返信目安",
    defaultValue: "12時間以内",
    fieldType: "text",
    hint: "表示のみ変わります。実際のSLA判定は「プラン設定」の分数で行われます",
  },
  {
    key: "plan.sla.premium",
    label: "プレミアムの返信目安",
    screen: "plan",
    group: "返信目安",
    defaultValue: "2時間以内",
    fieldType: "text",
    hint: "表示のみ変わります。実際のSLA判定は「プラン設定」の分数で行われます",
  },
  {
    key: "plan.recommended.plan",
    label: "「おすすめ」を付けるプラン",
    screen: "plan",
    group: "おすすめ表示",
    defaultValue: "standard",
    fieldType: "plan-select",
  },
  {
    key: "plan.recommended.label",
    label: "おすすめバッジの文言",
    screen: "plan",
    group: "おすすめ表示",
    defaultValue: "おすすめ",
    fieldType: "text",
  },
  {
    key: "plan.notice.trial",
    label: "トライアルありプランの請求案内",
    screen: "plan",
    group: "請求案内",
    defaultValue:
      "選んだプランで{days}日間の無料トライアルを開始します。トライアル期間中はいつでも解約でき、料金は発生しません。トライアル終了後は{price}が自動請求されます（解約しない限り毎月更新）。",
    fieldType: "multiline",
    vars: ["days", "price"],
  },
  {
    key: "plan.notice.notrial",
    label: "即時課金プラン（ライト）の請求案内",
    screen: "plan",
    group: "請求案内",
    defaultValue:
      "このプランはお申し込み後すぐにご利用を開始し、{price}が請求されます（解約しない限り毎月更新）。いつでも解約できます。",
    fieldType: "multiline",
    vars: ["price"],
  },
  {
    key: "plan.notice.annualHero",
    label: "年額選択時の上部案内",
    screen: "plan",
    group: "請求案内",
    defaultValue:
      "選んだプランで{days}日間の無料トライアルを開始します。トライアル終了後は年額（実質2ヶ月分お得）が自動請求されます。いつでも解約できます。",
    fieldType: "multiline",
    vars: ["days"],
  },
  {
    key: "plan.notice.annualCard",
    label: "年額プランカードの請求案内",
    screen: "plan",
    group: "請求案内",
    defaultValue:
      "{days}日間の無料トライアル後、{price}が自動請求されます（実質2ヶ月分お得・いつでも解約可）。",
    fieldType: "multiline",
    vars: ["days", "price"],
  },
  {
    key: "plan.cta.trial",
    label: "申込ボタン（トライアルあり）",
    screen: "plan",
    group: "ボタン",
    defaultValue: "このプランで{days}日間無料トライアル",
    fieldType: "text",
    vars: ["days"],
  },
  {
    key: "plan.cta.notrial",
    label: "申込ボタン（即時課金）",
    screen: "plan",
    group: "ボタン",
    defaultValue: "このプランで申し込む",
    fieldType: "text",
  },

  // ===== 完了画面 =====
  {
    key: "complete.trial.title",
    label: "トライアル開始時の見出し",
    screen: "complete",
    group: "トライアル開始",
    defaultValue: "{days}日間の無料トライアルを開始しました",
    fieldType: "text",
    vars: ["days"],
  },
  {
    key: "complete.trial.body",
    label: "トライアル開始時の本文（月額・年額共通）",
    screen: "complete",
    group: "トライアル開始",
    defaultValue:
      "{days}日間は無料でご利用いただけます。トライアル終了後は{price}が自動請求されます。トライアル期間中はいつでも解約できます。",
    fieldType: "multiline",
    vars: ["days", "price"],
  },
  {
    key: "complete.paid.title",
    label: "即時契約（ライト）の見出し",
    screen: "complete",
    group: "即時契約",
    defaultValue: "ご契約ありがとうございます",
    fieldType: "text",
  },
  {
    key: "complete.paid.body",
    label: "即時契約（ライト）の本文",
    screen: "complete",
    group: "即時契約",
    defaultValue: "{price}でのご契約です。本日からご利用いただけます。いつでも解約できます。",
    fieldType: "multiline",
    vars: ["price"],
  },
  {
    key: "complete.next.primary",
    label: "次にやることの案内（1行目）",
    screen: "complete",
    group: "次の案内",
    defaultValue: "担当の伴走メイトからのメッセージをお待ちください。",
    fieldType: "text",
  },
  {
    key: "complete.next.secondary",
    label: "次にやることの案内（2行目）",
    screen: "complete",
    group: "次の案内",
    defaultValue: "スマホの方はLINEアプリに戻って、トークの確認をお願いします。",
    fieldType: "text",
    emptiable: true,
  },
  {
    key: "complete.cta",
    label: "LINEに戻るボタン",
    screen: "complete",
    group: "次の案内",
    defaultValue: "LINEに戻る",
    fieldType: "text",
  },
  {
    key: "complete.note.pc",
    label: "PC利用者向けの注記",
    screen: "complete",
    group: "次の案内",
    defaultValue: "※ PCでお手続きされた方は、お使いのスマホでLINEを開いてください。",
    fieldType: "text",
    emptiable: true,
  },

  // ===== LINEメッセージ =====
  {
    key: "line.welcome.body",
    label: "友だち追加時の挨拶メッセージ",
    screen: "line",
    group: "友だち追加",
    defaultValue:
      "Rutinへようこそ！\n\n以下のリンクからメイトを選んで、{days}日間の無料トライアルを始めましょう。\n{subscribeUrl}",
    fieldType: "multiline",
    vars: ["days", "subscribeUrl"],
  },
  {
    key: "line.flex.alttext",
    label: "申込案内カードの通知文",
    screen: "line",
    group: "申込案内カード",
    defaultValue: "メイトを選んで{days}日間無料トライアルを始められます",
    fieldType: "text",
    vars: ["days"],
    hint: "LINEの通知やトーク一覧に表示される1行です",
  },
  {
    key: "line.flex.title",
    label: "申込案内カードの見出し",
    screen: "line",
    group: "申込案内カード",
    defaultValue: "メイトを選んで始めましょう",
    fieldType: "text",
  },
  {
    key: "line.flex.body",
    label: "申込案内カードの本文",
    screen: "line",
    group: "申込案内カード",
    defaultValue:
      "気になる伴走メイトを選んで、まずは{days}日間無料でRutinをお試しいただけます。",
    fieldType: "multiline",
    vars: ["days"],
  },
  {
    key: "line.flex.expiry",
    label: "有効期限の注記",
    screen: "line",
    group: "申込案内カード",
    defaultValue: "ボタンの有効期限は30分です。",
    fieldType: "text",
    emptiable: true,
  },
  {
    key: "line.flex.button",
    label: "申込案内カードのボタン",
    screen: "line",
    group: "申込案内カード",
    defaultValue: "メイトを見る",
    fieldType: "text",
    hint: "変更してもボタンは正しく動きます（システムが新しいラベルを自動で認識します）",
  },
] as const;

export type FunnelCopyKey = (typeof FUNNEL_COPY_DEFS)[number]["key"];

const DEF_MAP: ReadonlyMap<string, FunnelCopyDef> = new Map(
  FUNNEL_COPY_DEFS.map((d) => [d.key, d])
);

export function getFunnelCopyDef(key: string): FunnelCopyDef | undefined {
  return DEF_MAP.get(key);
}

/** 文言内の {変数} をすべて置換する。未知の変数はそのまま残す（黙って消さない）。 */
export function renderFunnelCopy(
  template: string,
  vars: Record<string, string | number> = {}
): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole
  );
}

/**
 * デフォルト文言に含まれる変数のうち、編集後の文言から消えているものを返す。
 * 1つでもあれば保存をブロックする（リンク切れ・情報欠落の事故を防ぐ）。
 */
export function missingRequiredVars(def: FunnelCopyDef, value: string): string[] {
  if (!def.vars || def.vars.length === 0) return [];
  return def.vars.filter(
    (name) =>
      def.defaultValue.includes(`{${name}}`) && !value.includes(`{${name}}`)
  );
}

/** number型キーの値を安全に整数へ（不正値はデフォルトへフォールバック）。 */
export function parseFunnelCopyNumber(def: FunnelCopyDef, value: string): number {
  const parsed = Number(value.trim());
  if (Number.isFinite(parsed)) return Math.trunc(parsed);
  return Math.trunc(Number(def.defaultValue)) || 0;
}
