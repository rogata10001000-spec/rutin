/**
 * テスト用の軽量モック Supabase クライアント。
 * チェーン可能なクエリビルダを模し、終端（single/maybeSingle/await）で
 * handler({ table, op }) の戻り値を返す。
 */
export type MockResult = { data?: unknown; error?: unknown };
export type MockHandler = (ctx: { table: string; op: string }) => MockResult;

class MockBuilder implements PromiseLike<MockResult> {
  private op = "select";
  constructor(
    private readonly table: string,
    private readonly handler: MockHandler
  ) {}

  select() {
    return this;
  }
  insert() {
    this.op = "insert";
    return this;
  }
  update() {
    this.op = "update";
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  upsert() {
    this.op = "upsert";
    return this;
  }
  eq() {
    return this;
  }
  neq() {
    return this;
  }
  in() {
    return this;
  }
  is() {
    return this;
  }
  lte() {
    return this;
  }
  gte() {
    return this;
  }
  or() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }

  single(): Promise<MockResult> {
    return Promise.resolve(this.result());
  }
  maybeSingle(): Promise<MockResult> {
    return Promise.resolve(this.result());
  }

  private result(): MockResult {
    return this.handler({ table: this.table, op: this.op });
  }

  then<TResult1 = MockResult, TResult2 = never>(
    onfulfilled?: ((value: MockResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.result()).then(onfulfilled, onrejected);
  }
}

export function createMockSupabase(handler: MockHandler) {
  return {
    from: (table: string) => new MockBuilder(table, handler),
  } as unknown as ReturnType<typeof import("@/lib/supabase/server").createAdminSupabaseClient>;
}
