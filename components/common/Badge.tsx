"use client";

type BadgePlanProps = {
  plan: "light" | "standard" | "premium";
};

const planConfig = {
  light: { label: "Light", className: "bg-stone-100 text-stone-600" },
  standard: { label: "Standard", className: "bg-sage/20 text-sage-800" },
  premium: { label: "Premium", className: "bg-terracotta/10 text-terracotta" },
};

export function BadgePlan({ plan }: BadgePlanProps) {
  const config = planConfig[plan];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

type BadgeStatusProps = {
  status: "trial" | "active" | "past_due" | "paused" | "canceled" | "incomplete";
};

const statusConfig = {
  trial: { label: "トライアル", className: "bg-yellow-100 text-yellow-700" },
  active: { label: "契約中", className: "bg-sage/20 text-sage-800" },
  past_due: { label: "支払い遅延", className: "bg-red-100 text-red-700" },
  paused: { label: "一時停止", className: "bg-stone-100 text-stone-600" },
  canceled: { label: "解約済み", className: "bg-stone-100 text-stone-500" },
  incomplete: { label: "未契約", className: "bg-stone-100 text-stone-500" },
};

export function BadgeStatus({ status }: BadgeStatusProps) {
  const config = statusConfig[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

type BadgeTagProps = {
  tag: string;
};

export function BadgeTag({ tag }: BadgeTagProps) {
  // 特殊タグのスタイリング
  if (tag === "🎂") {
    return (
      <span className="inline-flex items-center rounded-full bg-pink-100 px-2 py-0.5 text-xs font-medium text-pink-700">
        🎂 誕生日
      </span>
    );
  }
  if (tag === "💳") {
    return (
      <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
        💳 支払い
      </span>
    );
  }
  if (tag === "⚠️") {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        ⚠️ 要注意
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
      {tag}
    </span>
  );
}

type BadgeSlaProps = {
  remainingMinutes: number | null;
  warningMinutes: number;
};

export function BadgeSla({ remainingMinutes, warningMinutes }: BadgeSlaProps) {
  if (remainingMinutes === null) {
    return null;
  }

  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  const timeStr = hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;

  if (remainingMinutes === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
        SLA超過
      </span>
    );
  }

  if (remainingMinutes <= warningMinutes) {
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
        残り{timeStr}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600">
      残り{timeStr}
    </span>
  );
}

type BadgeRiskProps = {
  level?: number;
};

export function BadgeRisk({ level }: BadgeRiskProps) {
  if (!level) return null;

  return (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
      ⚠️ リスク{level}
    </span>
  );
}
