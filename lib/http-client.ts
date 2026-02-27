type RequestOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetry(
  input: string | URL,
  options: RequestOptions = {}
): Promise<Response> {
  const {
    timeoutMs = 10000,
    retries = 2,
    retryDelayMs = 300,
    ...requestInit
  } = options;

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        ...requestInit,
        signal: controller.signal,
      });

      if (response.ok) {
        return response;
      }

      if (response.status < 500 || attempt === retries) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        throw error;
      }
    } finally {
      clearTimeout(timeout);
    }

    attempt += 1;
    await sleep(retryDelayMs * Math.pow(2, attempt - 1));
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed");
}
