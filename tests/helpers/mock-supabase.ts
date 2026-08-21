/**
 * テスト用の軽量モック Supabase クライアント。
 * チェーン可能なクエリビルダを模し、終端（single/maybeSingle/await）で
 * handler({ table, op }) の戻り値を返す。
 */
export type MockResult = { data?: unknown; error?: unknown };
export type MockHandler = (ctx: {
  table: string;
  op: string;
  /** insert/update/upsert に渡された値（書き込み内容の検証用。既存テストは無視してよい） */
  payload?: unknown;
}) => MockResult;

class MockBuilder implements PromiseLike<MockResult> {
  private op = "select";
  private payload: unknown = undefined;
  constructor(
    private readonly table: string,
    private readonly handler: MockHandler
  ) {}

  select() {
    return this;
  }
  insert(values?: unknown) {
    this.op = "insert";
    this.payload = values;
    return this;
  }
  update(values?: unknown) {
    this.op = "update";
    this.payload = values;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  upsert(values?: unknown) {
    this.op = "upsert";
    this.payload = values;
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
    return this.handler({ table: this.table, op: this.op, payload: this.payload });
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
