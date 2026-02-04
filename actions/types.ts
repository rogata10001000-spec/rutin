export type ActionErrorCode =
  | "ZOD_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RLS_DENIED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "EXTERNAL_API_ERROR"
  | "CONFIG_ERROR"
  | "UNKNOWN";

export type ActionError = { code: ActionErrorCode; message: string };

export type ResultOk<T> = { ok: true; data: T; error?: undefined };
export type ResultErr = { ok: false; data?: undefined; error: ActionError };
export type Result<T> = ResultOk<T> | ResultErr;

/**
 * Result型のエラーチェック用type guard
 */
export function isResultError<T>(result: Result<T>): result is ResultErr {
  return !result.ok;
}

/**
 * Result型の成功チェック用type guard
 */
export function isResultOk<T>(result: Result<T>): result is ResultOk<T> {
  return result.ok;
}

/**
 * Result型からエラーメッセージを安全に取得
 */
export function getResultError<T>(result: Result<T>): ActionError | undefined {
  return result.ok ? undefined : result.error;
}

export const toZodErrorMessage = (message?: string) =>
  message ?? "入力内容を確認してください";
