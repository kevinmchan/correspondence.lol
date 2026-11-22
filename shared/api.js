import { SUPABASE_KEY, SUPABASE_URL } from './config.js';

// Call one of the public database functions (room_*, postmarks_*).
export async function rpc(name, args) {
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
  } catch {
    throw new Error('Can’t reach the server. Check your connection.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || 'Something went wrong. Please try again.');
  return body;
}
