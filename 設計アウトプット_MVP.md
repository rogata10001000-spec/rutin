# Rutin 管理画面 設計アウトプット（MVP）

要件定義書を唯一の仕様として、実装者が迷わず実装できるようにまとめた設計書です。  
既存の「画面別コンポーネント設計&テストケース.docs」の不足点を補完し、全体を網羅しています。

---

## 1) 画面別コンポーネント設計

> すべてのページは「Container（データ/権限）+ Presentational（UI）」分離。  
> 重要操作は Server Actions。RLSと二重/三重で守る。

### 共通（全画面で使う部品）

| 区分 | 置き場所 | 役割 |
| --- | --- | --- |
| Layout | `app/(admin)/layout.tsx` | 認証ガード、ロール取得、`AppShell`/`SideNav`/`TopBar` |
| AppShell | `components/layout/AppShell.tsx` | 2カラムレイアウト基盤 |
| SideNav | `components/layout/SideNav.tsx` | RBACでメニュー表示制御 |
| TopBar | `components/layout/TopBar.tsx` | ロール/ユーザー表示、補助操作 |
| Badge | `components/common/BadgePlan.tsx` `BadgeStatus.tsx` `BadgeTag.tsx` | plan/status/tag 表示 |
| ConfirmDialog | `components/common/ConfirmDialog.tsx` | 代理返信・価格変更・精算確定の二重確認 |
| Toast | `components/common/Toast.tsx` | 成功/失敗の通知 |
| Error/Empty/Skeleton | `components/common/ErrorState.tsx` `EmptyState.tsx` `LoadingSkeleton.tsx` | エラー/空/ローディング |

#### 共通補足
`Shadow` は UI・Server Action・RLS の三重で **送信不可**を担保する（送信ボタン非表示、アクション拒否、RLS拒否）。

---

### `/login`

| 項目 | 内容 |
| --- | --- |
| 目的 | スタッフが管理画面にログインする |
| server/client | Client（RHF+Zod、フォーム入力） |
| 使用コンポーネント | `LoginForm` |
| 使用するServer Actions | なし（Supabase Auth クライアント） |
| UI操作フロー | メール/PW入力 → 送信 → 成功で`/inbox` |
| RBAC | 全スタッフ |
| エラー/空状態 | 認証失敗はフォームエラー表示 |

---

### `/inbox`

| 項目 | 内容 |
| --- | --- |
| 目的 | 未返信/危険/未報告を優先表示し、対応を開始する |
| server/client | Server（一覧取得はサーバ）＋ Client（フィルタ/ソート状態） |
| 使用コンポーネント | `InboxFilters` `InboxTable` `InboxRowActions` |
| 使用するServer Actions | `getInboxItems(filters)` |
| UI操作フロー | フィルタ変更 → Server Action再取得 → テーブル更新 |
| RBAC | Admin/Supervisorは全件、Castは担当のみ（RLS） |
| エラー/空状態 | 失敗時`ErrorState`、空は`EmptyState` |

---

### `/users`

| 項目 | 内容 |
| --- | --- |
| 目的 | ユーザーを検索し詳細へ遷移する |
| server/client | Server（検索結果）＋ Client（検索入力） |
| 使用コンポーネント | `UserSearchBar` `UsersTable` |
| 使用するServer Actions | `searchUsers(query, filters)` |
| UI操作フロー | 検索入力 → 実行 → テーブル更新 → 行クリックで詳細/チャット |
| RBAC | Admin/Supervisor全件、Castは担当のみ |
| エラー/空状態 | 取得失敗は`ErrorState`、該当なしは`EmptyState` |

---

### `/users/[id]`

| 項目 | 内容 |
| --- | --- |
| 目的 | ユーザー詳細（契約/チェックイン/メモ/ギフト/売上）を把握する |
| server/client | Server（詳細データ）＋ Client（メモ編集/担当変更） |
| 使用コンポーネント | `UserHeaderCard` `SubscriptionCard` `CheckinMiniChart` `BirthdayCard` `MemoPanel` `GiftPanel` |
| 使用するServer Actions | `getUserDetail(id)` `upsertMemo(...)` `markBirthdayCongratulated(id)` `assignCast(...)` |
| UI操作フロー | メモ編集→保存→再取得、誕生日フラグ→保存 |
| RBAC | Admin/Supervisor全件、Cast担当のみ |
| エラー/空状態 | 取得失敗は`ErrorState`、メモ等は空表示 |

---

### `/chat/[id]`

| 項目 | 内容 |
| --- | --- |
| 目的 | チャット履歴を見ながら返信・代理返信・AI下書き・Shadow下書きを行う |
| server/client | Server（履歴/サイド情報）＋ Client（入力/ページング） |
| 使用コンポーネント | `ChatHistory` `MessageComposer` `AiDraftList` `MemoEditor` `BirthdayWidget` |
| 使用するServer Actions | `getChatThread` `getUserSideInfo` `sendMessage` `sendProxyMessage` `generateAiDrafts` `createShadowDraft` |
| UI操作フロー | 送信→Server Action→履歴更新。ProxyはConfirmDialog必須 |
| RBAC | Admin/Supervisor全件、Cast担当のみ。Shadowは下書きのみ |
| エラー/空状態 | 送信失敗はToast、履歴なしはEmpty |

---

### `/admin/staff`

| 項目 | 内容 |
| --- | --- |
| 目的 | スタッフの管理（表示名/ロール/稼働上限） |
| server/client | Server（一覧）＋ Client（編集ダイアログ） |
| 使用コンポーネント | `StaffTable` `InviteStaffDialog` `CapacityEditor` |
| 使用するServer Actions | `upsertStaffProfile` |
| UI操作フロー | 編集→保存→一覧更新 |
| RBAC | Adminのみ |
| エラー/空状態 | 取得失敗はError、空はEmpty |

---

### `/admin/pricing`

| 項目 | 内容 |
| --- | --- |
| 目的 | キャスト別プラン価格（override）設定 |
| server/client | Server（一覧）＋ Client（編集フォーム） |
| 使用コンポーネント | `CastSelector` `PlanPriceOverrideTable` `UpsertPriceOverrideDialog` |
| 使用するServer Actions | `upsertCastPlanPriceOverride` `changeUserSubscriptionPrice` |
| UI操作フロー | 追加/編集→ConfirmDialog→保存→一覧更新 |
| RBAC | Adminのみ |
| エラー/空状態 | 取得失敗はError、空はEmpty |

---

### `/admin/gifts`

| 項目 | 内容 |
| --- | --- |
| 目的 | ポイント商品/ギフトカタログの管理 |
| server/client | Server（一覧）＋ Client（編集フォーム） |
| 使用コンポーネント | `PointProductsTable` `GiftCatalogTable` `UpsertPointProductDialog` `UpsertGiftDialog` |
| 使用するServer Actions | `upsertPointProduct` `upsertGiftCatalog` |
| UI操作フロー | 追加/編集→保存→一覧更新 |
| RBAC | Adminのみ |
| エラー/空状態 | 取得失敗はError、空はEmpty |

---

### `/admin/payout-rules`

| 項目 | 内容 |
| --- | --- |
| 目的 | 配分率（global/cast）管理 |
| server/client | Server（一覧）＋ Client（編集） |
| 使用コンポーネント | `PayoutRuleEditor` `EffectiveFromDatePicker` |
| 使用するServer Actions | `upsertPayoutRule` |
| UI操作フロー | 追加/編集→保存→一覧更新 |
| RBAC | Adminのみ |
| エラー/空状態 | 取得失敗はError、空はEmpty |

---

### `/admin/settlements`

| 項目 | 内容 |
| --- | --- |
| 目的 | 精算バッチ作成→承認→支払完了 |
| server/client | Server（一覧/明細）＋ Client（期間選択/ConfirmDialog） |
| 使用コンポーネント | `SettlementPeriodPicker` `SettlementBatchList` `SettlementItemsTable` |
| 使用するServer Actions | `createSettlementBatch` `approveSettlementBatch` `markSettlementBatchPaid` |
| UI操作フロー | 期間選択→作成→Confirm→status更新 |
| RBAC | Adminのみ |
| エラー/空状態 | 取得失敗はError、空はEmpty |

---

### `/admin/audit`

| 項目 | 内容 |
| --- | --- |
| 目的 | 監査ログの検索・閲覧 |
| server/client | Server（検索結果）＋ Client（フィルタ入力） |
| 使用コンポーネント | `AuditFilters` `AuditTable` `AuditDetailDrawer` |
| 使用するServer Actions | `searchAuditLogs(filters)` |
| UI操作フロー | フィルタ変更→再取得→詳細表示 |
| RBAC | Admin/Supervisor |
| エラー/空状態 | 取得失敗はError、空はEmpty |

---

### `/help`（ユーザー向け）

| 項目 | 内容 |
| --- | --- |
| 目的 | 使い方ページ（購入/ギフト導線） |
| server/client | Server（静的） |
| 使用コンポーネント | `HelpPage` |
| 使用するServer Actions | なし |
| UI操作フロー | リンクから`/points`/`/gift`へ |
| RBAC | ログインなし（トークンでユーザー識別） |
| エラー/空状態 | 静的なので無し |

---

### `/points`（ユーザー向け）

| 項目 | 内容 |
| --- | --- |
| 目的 | ポイント購入（Stripe Checkout） |
| server/client | Server（商品取得）＋ Client（購入操作） |
| 使用コンポーネント | `PointProductCards` |
| 使用するServer Actions | `createPointCheckoutSession` |
| UI操作フロー | 商品選択→Checkout session作成→Stripeへ遷移 |
| RBAC | ログインなし（line_user_idトークン前提） |
| エラー/空状態 | 商品なしはEmpty、失敗はToast |

---

### `/gift`（ユーザー向け）

| 項目 | 内容 |
| --- | --- |
| 目的 | ギフト送信（ポイント消費） |
| server/client | Server（ギフト/残高取得）＋ Client（送信操作） |
| 使用コンポーネント | `PointBalanceCard` `GiftGrid` `ConfirmGiftDialog` |
| 使用するServer Actions | `sendGift` |
| UI操作フロー | ギフト選択→Confirm→送信→結果表示 |
| RBAC | ログインなし（line_user_idトークン前提） |
| エラー/空状態 | 残高不足はエラー、ギフトなしはEmpty |

---

## 2) テストケース表（Playwright / Vitest）

> 既存たたきに不足していた観点（Shadow送信不可のE2E詳細、配分・精算ダイアログ、監査閲覧、税抜計算の期待値など）を補完。

### 2.1 E2E（Playwright）

| ID | 対象 | 前提 | 手順 | 期待結果 |
| --- | --- | --- | --- | --- |
| E2E-001 | 認証成功 | 有効スタッフ | `/login`で正しい情報送信 | `/inbox`へ遷移 |
| E2E-002 | 認証失敗 |  | 誤PWで送信 | エラー表示 |
| E2E-003 | ガード | 未ログイン | `/inbox`直アクセス | `/login`へリダイレクト |
| E2E-010 | RBAC Cast閲覧 | Cast担当U1のみ | `/users` | U1のみ表示 |
| E2E-011 | RBAC Cast禁止 | Cast | `/chat/U2`直アクセス | 403/NotFound相当 |
| E2E-012 | RBAC Supervisor | Supervisor | `/users` | 全件表示 |
| E2E-013 | Admin限定UI | Cast | サイドナビ表示 | `/admin/*`非表示 |
| E2E-014 | Admin限定画面 | Cast | `/admin/pricing`直アクセス | 拒否 |
| E2E-020 | Inbox未返信優先 | 未返信U1 | `/inbox` | U1が上位表示 |
| E2E-021 | Inbox paused低下 | paused U2 | `/inbox` | U2の優先度低下 |
| E2E-022 | Inbox危険最優先 | risk open U3 | `/inbox` | U3が最上位付近 |
| E2E-023 | Inboxフィルタ | 複数プラン | プランフィルタ操作 | 対象のみ表示 |
| E2E-030 | ユーザー詳細 | U1に契約/メモ | `/users/U1` | 各カード表示 |
| E2E-031 | メモ追加 | Cast担当U1 | 追加→保存→再読込 | memo_revisions増加 |
| E2E-032 | メモピン | 同上 | ピンON→保存 | ピンセクションに表示 |
| E2E-033 | 誕生日フラグ | 生日当日U1 | 送信→フラグ押下 | birthday_congrats登録 |
| E2E-040 | チャット送信 | Cast担当U1 | 入力→送信 | outメッセージ追加 |
| E2E-041 | 代理返信 | Supervisor | Proxy ON→Confirm→送信 | sent_as_proxy=true、監査ログ |
| E2E-042 | 代理返信UI不可 | Cast | `/chat/U1` | Proxyトグル非表示 |
| E2E-050 | AI返信案 | Cast担当U1 | ボタン押下 | 3案表示 |
| E2E-051 | AI 1日3回制限 | 同上 | 4回目 | 4回目は拒否 |
| E2E-060 | Shadow下書き作成 | Shadow中CastB | 下書き保存 | shadow_drafts追加 |
| E2E-061 | Shadow送信禁止 | Shadow中CastB | 送信操作（UI/直叩き） | UI不可＋Server Action拒否 |
| E2E-070 | 担当変更 | Admin | U1の担当変更 | cast_assignments作成 |
| E2E-080 | 価格override | Admin | `/admin/pricing`で作成 | override反映、監査 |
| E2E-090 | ポイント購入 | U1トークン | `/points`購入操作 | Checkout session作成 |
| E2E-091 | 購入反映 | webhookモック | webhook送信 | ledger +points |
| E2E-092 | ギフト送信成功 | 残高十分 | `/gift`送信 | ledger減、revenue/payout/messages作成 |
| E2E-093 | ギフト残高不足 | 残高不足 | 送信 | トランザクションで拒否 |
| E2E-094 | 配分税抜 | 税率10% | 100ptギフト送信 | 税抜100/税10/税込110 |
| E2E-100 | 精算作成 | Admin | 期間指定→作成 | batch draft作成 |
| E2E-101 | 精算承認 | draftあり | approve→Confirm | status=approved |
| E2E-102 | 精算支払完了 | approved | paid→Confirm | status=paid |
| E2E-110 | 監査閲覧 | Supervisor | `/admin/audit` | 検索/表示できる |
| E2E-111 | 監査禁止 | Cast | `/admin/audit` | 拒否 |

### 2.2 Unit/Logic（Vitest）

| ID | 対象 | 前提 | 手順 | 期待結果 |
| --- | --- | --- | --- | --- |
| UT-001 | 税計算 | rate=0.1 | excl=100 | tax=10, incl=110 |
| UT-002 | 税端数 | 端数規則固定 | excl=101 | 規則通りのtax |
| UT-003 | 配分ルール解決 | global10/cast30 | castA | cast30が選択 |
| UT-004 | 配分ルール期間 | castA 30% valid_from後 | occurred_on前日 | globalにフォールバック |
| UT-005 | ポイント残高 | +1000/-300 | 集計 | 残高=700 |
| UT-006 | sendGift整合 | 残高=100 | sendGift | ledger/revenue/payout/messages整合 |
| UT-007 | sendGift残高不足 | 残高=50 | sendGift | 例外、何も永続化しない |
| UT-008 | webhook冪等 | webhook_events | 同event_id再送 | 2重処理されない |
| UT-009 | AI 1日3回 | JST基準 | 4回目 | 拒否 |
| UT-010 | Inbox優先度 | risk/open | 計算 | 最優先になる |
| UT-011 | Inbox優先度 | paused | 計算 | スコア低下 |
| UT-012 | 未報告判定 | 最終チェックイン | today-2日超 | 未報告true |
| UT-013 | SLA残 | sla=720min | last_user_msg_time | 残時間正 |
| UT-014 | 代理返信メタ | proxy send | 保存 | sent_as_proxy=true |
| UT-015 | 誕生日重複防止 | unique | 同年2回 | 2回目拒否 |
| UT-016 | 配分計算 | excl=100 percent=30 | 計算 | payout=30 |
| UT-017 | 未使用ポイント除外 | purchaseのみ | 集計 | payout_calcなし |
| UT-018 | 価格解決 | overrideあり | 解決 | override採用 |
| UT-019 | webhook冪等 | revenue_event unique | 同ref 2回 | 2回目拒否/skip |

> 端数規則は**税/配分とも切り捨て**で固定する（要件上、後から変更すると精算整合が崩れるため）。

---

## 3) Server Actions I/O（引数・戻り型）

> 重要操作は必ず Server Actions。失敗時は `Result<T>` 型で返し、UIはToast/Inlineエラーを表示する。

### 3.1 ファイル構成案

- `actions/messages.ts`
- `actions/memos.ts`
- `actions/assignments.ts`
- `actions/ai.ts`
- `actions/admin/pricing.ts`
- `actions/admin/payout-rules.ts`
- `actions/admin/settlements.ts`
- `actions/users.ts`
- `actions/gifts.ts`
- `actions/audit.ts`
- `actions/subscriptions.ts`（新規: プラン購入フロー）
- `lib/auth.ts`（新規: JWT認証ユーティリティ）

### 3.2 共通型

```ts
export type ActionErrorCode =
  | "ZOD_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RLS_DENIED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "EXTERNAL_API_ERROR"
  | "UNKNOWN";

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ActionErrorCode; message: string } };
```

### 3.3 Action 定義（MVP必須）

| function | 権限 | 引数（TS型） | 戻り値 | 失敗パターン | 監査ログ |
| --- | --- | --- | --- | --- | --- |
| `sendMessage` | Admin/Supervisor/Cast（担当） | `{ endUserId: string; body: string }` | `Result<{ messageId: string }>` | Zod/権限/RLS/LINE送信失敗 | `SEND_MESSAGE`（target=end_user） |
| `sendProxyMessage` | Admin/Supervisor | `{ endUserId: string; body: string; reason?: string }` | `Result<{ messageId: string }>` | Zod/権限/RLS/LINE送信失敗 | `PROXY_SEND` |
| `assignCast` | Admin（Supervisor可） | `{ endUserId: string; toCastId: string; reason: string; shadowUntil?: string }` | `Result<{ assignmentId: string }>` | Zod/権限/RLS/競合 | `ASSIGN_CAST` |
| `createShadowDraft` | Shadow対象Cast | `{ endUserId: string; body: string }` | `Result<{ draftId: string }>` | Zod/権限/RLS | `CREATE_SHADOW_DRAFT` |
| `upsertMemo` | Admin/Supervisor/Cast（担当） | `{ endUserId: string; category: string; pinned: boolean; body: string }` | `Result<{ memoId: string }>` | Zod/権限/RLS | `UPSERT_MEMO` / `PIN_MEMO` |
| `markBirthdayCongratulated` | Admin/Supervisor/Cast（担当） | `{ endUserId: string }` | `Result<{ id: string }>` | 競合（同年2回）/RLS | `BIRTHDAY_SENT` |
| `generateAiDrafts` | Admin/Supervisor/Cast（担当） | `{ endUserId: string }` | `Result<{ requestId: string; drafts: { type: string; body: string }[] }>` | 制限超過/外部API失敗 | `AI_DRAFT_REQUEST` |
| `upsertCastPlanPriceOverride` | Admin | `{ castId: string; planCode: string; stripePriceId: string; amountMonthly: number; validFrom: string; active: boolean }` | `Result<{ id: string }>` | Zod/権限/Stripe不整合 | `UPSERT_CAST_PLAN_PRICE` |
| `changeUserSubscriptionPrice` | Admin | `{ endUserId: string; mode: "next_cycle" \| "immediate" }` | `Result<{ subscriptionId: string }>` | 権限/Stripe失敗 | `CHANGE_SUBSCRIPTION_PRICE` |
| `createPointCheckoutSession` | UserWeb | `{ endUserId: string; pointProductId: string }` | `Result<{ checkoutUrl: string }>` | Zod/Stripe失敗 | `POINT_CHECKOUT_CREATE` |
| `sendGift` | UserWeb | `{ endUserId: string; giftId: string }` | `Result<{ giftSendId: string; revenueEventId: string; payoutId: string }>` | 残高不足/競合/DB失敗 | `GIFT_SEND` |
| `upsertPayoutRule` | Admin | `{ ruleType: "gift_share"; scopeType: "global"\|"cast"; castId?: string; percent: number; effectiveFrom: string; active: boolean }` | `Result<{ id: string }>` | Zod/権限 | `UPSERT_PAYOUT_RULE` |
| `createSettlementBatch` | Admin | `{ periodFrom: string; periodTo: string }` | `Result<{ batchId: string }>` | 期間重複/権限 | `SETTLEMENT_BATCH_CREATE` |
| `approveSettlementBatch` | Admin | `{ batchId: string }` | `Result<{ batchId: string }>` | 権限/状態不正 | `SETTLEMENT_BATCH_APPROVE` |
| `markSettlementBatchPaid` | Admin | `{ batchId: string }` | `Result<{ batchId: string }>` | 権限/状態不正 | `SETTLEMENT_BATCH_PAID` |
| `searchUsers` | Admin/Supervisor/Cast | `{ query?: string; filters?: {...} }` | `Result<{ items: UserListItem[] }>` | Zod/RLS | `SEARCH_USERS`（任意） |
| `getUserDetail` | Admin/Supervisor/Cast | `{ endUserId: string }` | `Result<UserDetail>` | NotFound/RLS | `GET_USER_DETAIL`（任意） |
| `getInboxItems` | Admin/Supervisor/Cast | `{ filters?: {...} }` | `Result<{ items: InboxItem[] }>` | Zod/RLS | `GET_INBOX_ITEMS`（任意） |
| `getChatThread` | Admin/Supervisor/Cast | `{ endUserId: string; cursor?: string }` | `Result<{ items: Message[]; nextCursor?: string }>` | RLS | `GET_CHAT_THREAD`（任意） |
| `searchAuditLogs` | Admin/Supervisor | `{ filters?: {...} }` | `Result<{ items: AuditLog[] }>` | 権限 | `SEARCH_AUDIT_LOGS`（任意） |
| `generateUserToken` | System | `{ lineUserId: string }` | `Result<{ token: string }>` | JWT生成失敗 | なし |
| `verifyUserToken` | System | `{ token: string }` | `Result<{ lineUserId: string }>` | トークン無効/期限切れ | なし |
| `listAvailableCasts` | UserWeb | `{ planCode?: string }` | `Result<{ casts: AvailableCast[] }>` | DB取得失敗 | なし |
| `createSubscriptionCheckout` | UserWeb | `{ lineUserId: string; castId: string; planCode: string }` | `Result<{ checkoutUrl: string }>` | Stripe失敗 | `SUBSCRIPTION_CHECKOUT_CREATE` |

#### 監査ログの共通メタデータ
- `action`: 付録Aの定義に準拠
- `target_type/target_id`: 対象テーブル/ID
- `metadata`: before/after、理由、計算内訳、外部API結果

---

## 4) Zodスキーマ

> `schemas/*.ts` に配置。日本語エラーメッセージを統一（短く具体的に）。

### 4.1 一覧（スキーマ名 / 用途 / 置き場所）

| スキーマ | 用途 | ファイル |
| --- | --- | --- |
| `loginSchema` | ログインフォーム | `schemas/auth.ts` |
| `sendMessageSchema` | 通常送信 | `schemas/messages.ts` |
| `sendProxyMessageSchema` | 代理返信 | `schemas/messages.ts` |
| `memoSchema` | メモ保存 | `schemas/memos.ts` |
| `assignCastSchema` | 担当変更/Shadow | `schemas/assignments.ts` |
| `aiDraftRequestSchema` | AI返信案 | `schemas/ai.ts` |
| `pricingOverrideSchema` | 価格override | `schemas/pricing.ts` |
| `payoutRuleSchema` | 配分率 | `schemas/payout.ts` |
| `pointCheckoutSchema` | ポイント購入 | `schemas/gifts.ts` |
| `sendGiftSchema` | ギフト送信 | `schemas/gifts.ts` |
| `settlementPeriodSchema` | 精算期間 | `schemas/settlements.ts` |

### 4.2 主要スキーマ（コピペ用）

```ts
// schemas/messages.ts
import { z } from "zod";

export const sendMessageSchema = z.object({
  endUserId: z.string().uuid(),
  body: z.string().trim().min(1, "本文を入力してください").max(2000, "2000文字以内で入力してください"),
});

export const sendProxyMessageSchema = z.object({
  endUserId: z.string().uuid(),
  body: z.string().trim().min(1, "本文を入力してください").max(2000, "2000文字以内で入力してください"),
  reason: z.string().trim().max(200, "200文字以内で入力してください").optional(),
});
```

```ts
// schemas/memos.ts
import { z } from "zod";

export const memoSchema = z.object({
  endUserId: z.string().uuid(),
  category: z.string().trim().min(1, "カテゴリを選択してください"),
  pinned: z.boolean(),
  body: z.string().trim().min(1, "メモを入力してください").max(5000, "5000文字以内で入力してください"),
});
```

```ts
// schemas/assignments.ts
import { z } from "zod";

export const assignCastSchema = z.object({
  endUserId: z.string().uuid(),
  toCastId: z.string().uuid(),
  reason: z.string().trim().min(1, "理由を入力してください").max(200, "200文字以内で入力してください"),
  shadowUntil: z.string().datetime().optional(),
});
```

```ts
// schemas/ai.ts
import { z } from "zod";

export const aiDraftRequestSchema = z.object({
  endUserId: z.string().uuid(),
});
```

```ts
// schemas/pricing.ts
import { z } from "zod";

export const pricingOverrideSchema = z.object({
  castId: z.string().uuid(),
  planCode: z.enum(["light", "standard", "premium"]),
  stripePriceId: z.string().min(1, "Stripe Price IDが必要です"),
  amountMonthly: z.number().int().positive("金額は正の整数で入力してください"),
  validFrom: z.string().date(),
  active: z.boolean(),
});
```

```ts
// schemas/payout.ts
import { z } from "zod";

export const payoutRuleSchema = z.object({
  ruleType: z.literal("gift_share"),
  scopeType: z.enum(["global", "cast"]),
  castId: z.string().uuid().optional(),
  percent: z.number().min(0).max(100),
  effectiveFrom: z.string().date(),
  active: z.boolean(),
});
```

```ts
// schemas/gifts.ts
import { z } from "zod";

export const pointCheckoutSchema = z.object({
  endUserId: z.string().uuid(),
  productId: z.string().uuid(),
});

export const sendGiftSchema = z.object({
  endUserId: z.string().uuid(),
  giftId: z.string().uuid(),
});
```

```ts
// schemas/settlements.ts
import { z } from "zod";

export const settlementPeriodSchema = z
  .object({
    from: z.string().date(),
    to: z.string().date(),
  })
  .refine((v) => v.from <= v.to, { message: "期間の開始と終了を確認してください" });
```

#### エラーメッセージ方針
- 日本語で短く明確に（例: 「本文を入力してください」）
- 数値/日付の範囲は具体的に示す
- 権限/RLSの拒否は「権限がありません」で統一

---

## 5) TanStack Table columns 定義

> `components/tables/*.ts` に配置。各テーブルの Row 型と columns を記載。

### 5.1 InboxTable

**置き場所**：`components/inbox/InboxTable.columns.ts`

```ts
import { ColumnDef } from "@tanstack/react-table";

export type InboxRow = {
  id: string;
  nickname: string;
  planCode: "light" | "standard" | "premium";
  status: "trial" | "active" | "past_due" | "paused" | "canceled" | "incomplete";
  assignedCastName: string | null;
  nextRenewalDate: string | null;
  unrepliedMinutes: number | null;
  tags: string[];
  priorityScore: number;
  hasRisk: boolean;
};

export const inboxColumns: ColumnDef<InboxRow>[] = [
  { accessorKey: "nickname", header: "ユーザー", enableSorting: true },
  { accessorKey: "planCode", header: "プラン", enableSorting: true, meta: { render: "badgePlan" } },
  { accessorKey: "status", header: "状態", enableSorting: true, meta: { render: "badgeStatus" } },
  { accessorKey: "assignedCastName", header: "担当", enableSorting: true },
  { accessorKey: "nextRenewalDate", header: "更新日", enableSorting: true },
  { accessorKey: "unrepliedMinutes", header: "未返信", enableSorting: true },
  { accessorKey: "tags", header: "タグ", enableSorting: false, meta: { render: "tagList" } },
  { accessorKey: "priorityScore", header: "優先度", enableSorting: true },
];
```

**ソート/フィルタ方針**
- `priorityScore` を既定ソート（desc）
- フィルタ: plan/status/担当/タグ/危険/未報告
- `hasRisk` は危険最優先ルールに使用

---

### 5.2 UsersTable

**置き場所**：`components/users/UsersTable.columns.ts`

```ts
import { ColumnDef } from "@tanstack/react-table";

export type UsersRow = {
  id: string;
  nickname: string;
  planCode: "light" | "standard" | "premium";
  status: "trial" | "active" | "past_due" | "paused" | "canceled" | "incomplete";
  assignedCastName: string | null;
  unrepliedMinutes: number | null;
  tags: string[];
};

export const usersColumns: ColumnDef<UsersRow>[] = [
  { accessorKey: "nickname", header: "ユーザー", enableSorting: true },
  { accessorKey: "planCode", header: "プラン", enableSorting: true, meta: { render: "badgePlan" } },
  { accessorKey: "status", header: "状態", enableSorting: true, meta: { render: "badgeStatus" } },
  { accessorKey: "assignedCastName", header: "担当", enableSorting: true },
  { accessorKey: "unrepliedMinutes", header: "未返信", enableSorting: true },
  { accessorKey: "tags", header: "タグ", enableSorting: false, meta: { render: "tagList" } },
];
```

**ソート/フィルタ方針**
- 検索は nickname / tags
- plan/status/担当でフィルタ

---

### 5.3 GiftHistoryTable（ユーザー詳細）

**置き場所**：`components/users/GiftHistoryTable.columns.ts`

```ts
import { ColumnDef } from "@tanstack/react-table";

export type GiftHistoryRow = {
  id: string;
  sentAt: string;
  giftName: string;
  costPoints: number;
  castName: string | null;
};

export const giftHistoryColumns: ColumnDef<GiftHistoryRow>[] = [
  { accessorKey: "sentAt", header: "日時", enableSorting: true },
  { accessorKey: "giftName", header: "ギフト", enableSorting: true },
  { accessorKey: "costPoints", header: "ポイント", enableSorting: true },
  { accessorKey: "castName", header: "担当", enableSorting: true },
];
```

**ソート/フィルタ方針**
- `sentAt` desc を既定

---

### 5.4 RevenueEventsTable（ユーザー詳細）

**置き場所**：`components/users/RevenueEventsTable.columns.ts`

```ts
import { ColumnDef } from "@tanstack/react-table";

export type RevenueEventRow = {
  id: string;
  occurredOn: string;
  amountExclTax: number;
  taxJpy: number;
  amountInclTax: number;
  eventType: "gift_redeem";
};

export const revenueEventColumns: ColumnDef<RevenueEventRow>[] = [
  { accessorKey: "occurredOn", header: "日付", enableSorting: true },
  { accessorKey: "amountExclTax", header: "税抜", enableSorting: true },
  { accessorKey: "taxJpy", header: "税", enableSorting: true },
  { accessorKey: "amountInclTax", header: "税込", enableSorting: true },
];
```

**ソート/フィルタ方針**
- `occurredOn` desc を既定

---

### 5.5 AuditTable

**置き場所**：`components/audit/AuditTable.columns.ts`

```ts
import { ColumnDef } from "@tanstack/react-table";

export type AuditRow = {
  id: string;
  createdAt: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  success: boolean;
};

export const auditColumns: ColumnDef<AuditRow>[] = [
  { accessorKey: "createdAt", header: "日時", enableSorting: true },
  { accessorKey: "actorName", header: "操作者", enableSorting: true },
  { accessorKey: "action", header: "操作", enableSorting: true },
  { accessorKey: "targetType", header: "対象", enableSorting: true },
  { accessorKey: "success", header: "結果", enableSorting: true, meta: { render: "badgeSuccess" } },
];
```

**ソート/フィルタ方針**
- `createdAt` desc を既定
- action/actor/date でフィルタ

---

### 5.6 SettlementItemsTable

**置き場所**：`components/settlements/SettlementItemsTable.columns.ts`

```ts
import { ColumnDef } from "@tanstack/react-table";

export type SettlementItemRow = {
  id: string;
  castName: string;
  amountJpy: number;
  breakdownCount: number;
};

export const settlementItemColumns: ColumnDef<SettlementItemRow>[] = [
  { accessorKey: "castName", header: "キャスト", enableSorting: true },
  { accessorKey: "amountJpy", header: "金額", enableSorting: true },
  { accessorKey: "breakdownCount", header: "内訳件数", enableSorting: true },
];
```

**ソート/フィルタ方針**
- `amountJpy` desc 既定

---

## 6) 状態管理の粒度（server/client境界）

> DB由来はServer、UI操作状態はClient。  
> 事故リスク操作は ConfirmDialog＋Server Action＋監査ログ。

| ページ | serverで持つデータ | clientで持つUI状態 | 重要操作の安全策 |
| --- | --- | --- | --- |
| `/login` | なし | 入力値、送信中 | なし |
| `/inbox` | InboxItems（優先度計算済み） | フィルタ、ソート、ページング | なし |
| `/users` | 検索結果 | 検索文字列、フィルタ | なし |
| `/users/[id]` | ユーザー詳細一式 | メモ入力、担当変更ダイアログ | 担当変更はConfirmDialog＋監査 |
| `/chat/[id]` | 履歴/サイド情報 | 返信入力、AI案展開、ページング | 代理返信/ShadowはConfirmDialog＋Server Action |
| `/admin/staff` | スタッフ一覧 | 編集ダイアログ | 監査ログ |
| `/admin/pricing` | 価格一覧 | 編集フォーム、選択キャスト | 変更はConfirmDialog＋監査 |
| `/admin/gifts` | 商品/ギフト一覧 | 編集フォーム | 監査ログ |
| `/admin/payout-rules` | ルール一覧 | 編集フォーム | 監査ログ |
| `/admin/settlements` | バッチ/明細 | 期間選択、ConfirmDialog | 取り消し不可の確認 |
| `/admin/audit` | 監査ログ検索結果 | フィルタ | なし |
| `/help` | 静的 | なし | なし |
| `/points` | 商品一覧 | 送信中/エラー | Checkout作成はServer Action |
| `/gift` | ギフト/残高 | ギフト選択/Confirm | sendGiftはトランザクション＋監査 |

---

## 仕様の曖昧さ・不足点（要件定義書の不足箇所と仮置き）

1. **税/配分の端数規則**  
   - 要件定義書では「税率に基づき計算」とあるが、端数規則の明示がない。  
   - 仮置き：**税・配分とも切り捨て**（既存テストたたきの推奨に合わせる）。

2. **ユーザー向けページの認証トークン仕様**（確定）
   - **JWT署名付き一時トークン方式**
   - 有効期限: 30分
   - 署名シークレット: `LINE_USER_TOKEN_SECRET`
   - URL形式: `?token=SIGNED_TOKEN`

---

## 追加マイグレーション（MVP要件詰め反映）

### style_summary追加
```sql
-- 20260203_add_cast_style_summary.sql
ALTER TABLE staff_profiles 
ADD COLUMN IF NOT EXISTS style_summary text null,
ADD COLUMN IF NOT EXISTS style_updated_at timestamptz null;

COMMENT ON COLUMN staff_profiles.style_summary IS 'キャストの返信スタイル要約（AI返信案の文脈用）';
```

### 初期ギフトカタログ
```sql
-- 20260203_seed_gift_catalog.sql
INSERT INTO gift_catalog (id, name, category, cost_points, icon, sort_order, active) VALUES
(gen_random_uuid(), 'コーヒー1杯', '感謝', 300, '☕', 1, true),
(gen_random_uuid(), 'ケーキ', '感謝', 500, '🍰', 2, true),
(gen_random_uuid(), 'お花', '感謝', 800, '🌸', 3, true),
(gen_random_uuid(), '本1冊', '応援', 1500, '📚', 4, true),
(gen_random_uuid(), '映画チケット', '応援', 2000, '🎬', 5, true),
(gen_random_uuid(), 'ランチ', '応援', 1000, '🍱', 6, true),
(gen_random_uuid(), 'プレゼント', '特別', 5000, '🎁', 7, true),
(gen_random_uuid(), 'スペシャル', '特別', 10000, '✨', 8, true)
ON CONFLICT DO NOTHING;
```

### 初期ポイント商品
```sql
-- 20260203_seed_point_products.sql
INSERT INTO point_products (id, name, points, price_excl_tax_jpy, tax_rate_id, price_incl_tax_jpy, stripe_price_id, active) VALUES
(gen_random_uuid(), '1,000ポイント', 1000, 1000, (SELECT id FROM tax_rates WHERE rate = 0.1000 LIMIT 1), 1100, 'price_1000pt', true),
(gen_random_uuid(), '3,000ポイント', 3000, 2800, (SELECT id FROM tax_rates WHERE rate = 0.1000 LIMIT 1), 3080, 'price_3000pt', true),
(gen_random_uuid(), '5,000ポイント', 5000, 4500, (SELECT id FROM tax_rates WHERE rate = 0.1000 LIMIT 1), 4950, 'price_5000pt', true),
(gen_random_uuid(), '10,000ポイント', 10000, 8500, (SELECT id FROM tax_rates WHERE rate = 0.1000 LIMIT 1), 9350, 'price_10000pt', true)
ON CONFLICT DO NOTHING;
```

---

## 次の一歩（任意）

- この設計書をもとに `actions/*` と `schemas/*` の実装スケルトン作成  
- TanStack Table columns を各ページへ組み込み  
- テスト（Playwright / Vitest）の雛形追加

