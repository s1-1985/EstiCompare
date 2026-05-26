import { auth } from '../firebase';

/**
 * Authenticated fetch wrapper — attaches Firebase ID token to all API requests.
 *
 * When the server returns 429 (Gemini rate-limit), the client waits for
 * `retryAfter` seconds (default 62) and then retries once automatically.
 * Pass `onRetryCountdown` to display a live countdown in the UI during the wait.
 */
export async function apiPost(
  url: string,
  body: unknown,
  {
    onRetryCountdown,
    maxRetries = 1,
  }: {
    onRetryCountdown?: (secondsLeft: number | null) => void;
    maxRetries?: number;
  } = {}
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (res.ok) return res;

    let data: Record<string, unknown> = {};
    try {
      data = await res.json();
    } catch { /* ignore parse errors */ }

    if (res.status === 429 && attempt < maxRetries && onRetryCountdown) {
      const retryAfter = typeof data.retryAfter === 'number' ? data.retryAfter : 62;
      for (let s = retryAfter; s > 0; s--) {
        onRetryCountdown(s);
        await new Promise<void>(r => setTimeout(r, 1000));
      }
      onRetryCountdown(null);
      continue;
    }

    const message = typeof data.error === 'string' ? data.error : `HTTPエラー ${res.status}`;
    throw new Error(message);
  }

  throw new Error('最大リトライ回数を超えました');
}
