import { auth } from '../lib/firebase';

export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 60000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  const headers = new Headers(options.headers || {});
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const token = await currentUser.getIdToken();
      headers.set('Authorization', `Bearer ${token}`);
    } catch (err) {
      console.error("Failed to get Firebase ID token:", err);
    }
  }
  options.headers = headers;

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error("The request took too long. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(id);
  }
}

