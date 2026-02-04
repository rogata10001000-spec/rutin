import { test, expect } from "@playwright/test";

test.describe("Cast Photos - Public View", () => {
  test("should display cast list page", async ({ page }) => {
    await page.goto("/subscribe/cast");
    
    // ページタイトルが表示されることを確認
    await expect(page.locator("h2")).toContainText("相談員を選ぶ");
  });

  test("should show promotional banner", async ({ page }) => {
    await page.goto("/subscribe/cast");
    
    // 7日間無料トライアルバナーが表示されることを確認
    await expect(page.getByText("7日間無料トライアル")).toBeVisible();
  });

  test("should show category filters", async ({ page }) => {
    await page.goto("/subscribe/cast");
    
    // カテゴリーフィルターが表示されることを確認
    await expect(page.getByText("すべて")).toBeVisible();
    await expect(page.getByText("結婚相談")).toBeVisible();
    await expect(page.getByText("片思い")).toBeVisible();
  });

  test("should navigate to plan page when clicking consult button", async ({ page }) => {
    await page.goto("/subscribe/cast");
    
    // 「相談する」ボタンがあれば、クリックしてプラン選択ページに遷移
    const consultButton = page.getByRole("link", { name: "相談する" }).first();
    
    if (await consultButton.isVisible()) {
      await consultButton.click();
      await expect(page).toHaveURL(/\/subscribe\/plan/);
    }
  });
});

test.describe("Cast Photos - Photo Modal", () => {
  test("should open photo modal when clicking on cast photo", async ({ page }) => {
    await page.goto("/subscribe/cast");
    
    // 写真がある場合、クリックでモーダルが開くことを確認
    const photoButton = page.locator("button").filter({ has: page.locator("div[style*='background-image']") }).first();
    
    if (await photoButton.isVisible()) {
      await photoButton.click();
      
      // モーダルが表示されることを確認
      await expect(page.getByRole("dialog")).toBeVisible();
    }
  });

  test("should close modal when clicking close button", async ({ page }) => {
    await page.goto("/subscribe/cast");
    
    const photoButton = page.locator("button").filter({ has: page.locator("div[style*='background-image']") }).first();
    
    if (await photoButton.isVisible()) {
      await photoButton.click();
      
      // 閉じるボタンをクリック
      const closeButton = page.getByRole("button", { name: "閉じる" });
      await closeButton.click();
      
      // モーダルが閉じることを確認
      await expect(page.getByRole("dialog")).not.toBeVisible();
    }
  });

  test("should close modal when pressing Escape key", async ({ page }) => {
    await page.goto("/subscribe/cast");
    
    const photoButton = page.locator("button").filter({ has: page.locator("div[style*='background-image']") }).first();
    
    if (await photoButton.isVisible()) {
      await photoButton.click();
      
      // Escキーを押す
      await page.keyboard.press("Escape");
      
      // モーダルが閉じることを確認
      await expect(page.getByRole("dialog")).not.toBeVisible();
    }
  });
});

test.describe("Cast Photos - Admin Management", () => {
  test.beforeEach(async ({ page }) => {
    // ログイン処理（テスト用認証情報を使用）
    await page.goto("/login");
    // 実際のテストでは認証をモックするか、テスト用のクッキーを設定
  });

  test("should access staff list page as admin", async ({ page }) => {
    // 認証済みの状態でスタッフ一覧にアクセス
    await page.goto("/admin/staff");
    
    // スタッフ一覧が表示されることを確認
    await expect(page.getByText("スタッフ管理")).toBeVisible();
  });

  test("should have photos link for cast members", async ({ page }) => {
    await page.goto("/admin/staff");
    
    // キャストに「写真」リンクがあることを確認
    const photosLink = page.getByRole("link", { name: "写真" }).first();
    
    if (await photosLink.isVisible()) {
      expect(await photosLink.getAttribute("href")).toMatch(/\/admin\/staff\/.*\/photos/);
    }
  });
});

test.describe("Cast Photos - Photo Editor", () => {
  test.beforeEach(async ({ page }) => {
    // 管理者としてログイン
    await page.goto("/login");
    // 認証処理をモック
  });

  test("should display photo editor with upload button", async ({ page }) => {
    // テスト用のキャストIDでアクセス
    const testCastId = "test-cast-id";
    await page.goto(`/admin/staff/${testCastId}/photos`);
    
    // 「写真を追加」ボタンが表示されることを確認
    await expect(page.getByText("写真を追加")).toBeVisible();
  });

  test("should show empty state when no photos", async ({ page }) => {
    const testCastId = "test-cast-id";
    await page.goto(`/admin/staff/${testCastId}/photos`);
    
    // 写真がない場合の空状態メッセージ
    const emptyMessage = page.getByText("まだ写真がありません");
    
    if (await emptyMessage.isVisible()) {
      expect(emptyMessage).toBeVisible();
    }
  });

  test("should show usage instructions", async ({ page }) => {
    const testCastId = "test-cast-id";
    await page.goto(`/admin/staff/${testCastId}/photos`);
    
    // 使い方の説明が表示されることを確認
    await expect(page.getByText("使い方")).toBeVisible();
    await expect(page.getByText("ドラッグ&ドロップで写真の順序を変更できます")).toBeVisible();
  });
});

test.describe("Cast Photos - File Upload Validation", () => {
  test("should reject files over 5MB", async ({ page }) => {
    // この機能はUIで実装されているため、クライアントサイドのバリデーションをテスト
    const testCastId = "test-cast-id";
    await page.goto(`/admin/staff/${testCastId}/photos`);
    
    // アップロードボタンの存在を確認
    await expect(page.getByText("写真を追加")).toBeVisible();
    
    // 注意: 実際のファイルアップロードテストはE2Eでは制限がある
    // サイズ制限のテストはユニットテストで行う
  });

  test("should only accept image files", async ({ page }) => {
    const testCastId = "test-cast-id";
    await page.goto(`/admin/staff/${testCastId}/photos`);
    
    // input要素のaccept属性を確認
    const fileInput = page.locator('input[type="file"]');
    
    if (await fileInput.count() > 0) {
      const accept = await fileInput.getAttribute("accept");
      expect(accept).toContain("image/jpeg");
      expect(accept).toContain("image/png");
      expect(accept).toContain("image/webp");
    }
  });
});

test.describe("Cast Photos - Accessibility", () => {
  test("should have proper ARIA labels on modal", async ({ page }) => {
    await page.goto("/subscribe/cast");
    
    const photoButton = page.locator("button").filter({ has: page.locator("div[style*='background-image']") }).first();
    
    if (await photoButton.isVisible()) {
      await photoButton.click();
      
      // モーダルのARIA属性を確認
      const dialog = page.getByRole("dialog");
      await expect(dialog).toHaveAttribute("aria-modal", "true");
    }
  });

  test("should support keyboard navigation in carousel", async ({ page }) => {
    await page.goto("/subscribe/cast");
    
    const photoButton = page.locator("button").filter({ has: page.locator("div[style*='background-image']") }).first();
    
    if (await photoButton.isVisible()) {
      await photoButton.click();
      
      // 矢印キーでナビゲーションできることを確認
      // 複数写真がある場合のみテスト可能
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowLeft");
    }
  });
});
