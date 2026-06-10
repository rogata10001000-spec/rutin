export const MEMO_CATEGORIES = [
  { value: "profile", label: "プロフィール" },
  { value: "ng", label: "NG事項" },
  { value: "resonance", label: "刺さる言葉" },
  { value: "other", label: "その他" },
] as const;

export type MemoCategory = (typeof MEMO_CATEGORIES)[number]["value"];
