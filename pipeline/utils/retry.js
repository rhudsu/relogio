const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export function isTransientError(error) {
  return RETRYABLE_STATUSES.has(error?.status);
}

export async function retryOnTransientError(operation, { delaysMs, sleep, onRetry = () => {} }) {
  for (const [attempt, delayMs] of delaysMs.entries()) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientError(error)) throw error;

      onRetry({ attempt: attempt + 1, delayMs, error });
      await sleep(delayMs);
    }
  }

  return operation();
}
