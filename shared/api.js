import { SUPABASE_KEY, SUPABASE_URL } from './config.js';

const SIGNED_OUT = 'You are signed out on this device.';

async function post(path, body, headers = {}) {
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}${path}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Can’t reach the server. Check your connection.');
  }
  const answer = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(answer?.message || answer?.msg || answer?.error_description || 'Something went wrong. Please try again.');
  }
  return answer;
}

// Call one of the public database functions (room_*, postmarks_*, profile_*).
// `signIn` is the proof of a sign-in just made, for the one call that needs it.
export async function rpc(name, args, signIn = null) {
  try {
    return await post(`/rest/v1/rpc/${name}`, args, signIn ? { Authorization: `Bearer ${signIn}` } : {});
  } catch (failure) {
    // This device was signed out of its profile (it became an account, or was
    // signed out here): the home page offers the ways back in.
    if (failure.message === SIGNED_OUT && location.pathname !== '/') location.replace('/');
    throw failure;
  }
}

// The sign-in service: sending a code to an email address, and checking it.
export const auth = (path, body) => post(`/auth/v1/${path}`, body);
