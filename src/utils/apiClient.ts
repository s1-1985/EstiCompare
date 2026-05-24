import { auth } from '../firebase';

/**
 * Authenticated fetch wrapper — attaches Firebase ID token to all API requests.
 * Throws a user-friendly Error if the response is not ok.
 */
export async function apiPost(url: string, body: unknown): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message: string;
    try {
      const data = await res.json();
      message = data.error || `HTTPエラー ${res.status}`;
    } catch {
      message = `HTTPエラー ${res.status}`;
    }
    throw new Error(message);
  }

  return res;
}
