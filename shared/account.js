// Profiles. A person is a profile, and this device is a way in to one.
//   - A guest profile needs no sign-in. Every new device starts as one, and
//     another device can join it with a temporary code.
//   - An account is a profile tied to an email address. A guest profile can
//     be turned into an account at any time; after that the only way in is to
//     sign in, with a code sent to that address.
// The server is the authority (see supabase/migrations/*_profiles.sql); what
// is kept on the device is a copy, so pages can draw before it answers.

import { auth, rpc } from './api.js';
import { load, myToken, resetIdentity, save, setMyName, setRooms } from './identity.js';
import { saveLook } from './profile.js';
import { copyable } from './handoff.js';

const PROFILE_KEY = 'correspondence:profile:v1'; // { signed_in, email, signed_out }

export const cachedProfile = () => load(PROFILE_KEY) ?? {};

// Take the server's word for who this device is, and remember it.
export function adopt(profile) {
  save(PROFILE_KEY, { signed_in: Boolean(profile.signed_in), email: profile.email ?? null, signed_out: Boolean(profile.signed_out) });
  if (profile.signed_out) return profile;
  setMyName(profile.name ?? '');
  if (profile.avatar && Number.isInteger(profile.color)) saveLook(profile.avatar, profile.color);
  setRooms(profile.rooms ?? []);
  return profile;
}

export const fetchProfile = async () => adopt(await rpc('profile_get', { p_token: myToken() }));

export const saveProfile = async ({ name, avatar, color }) =>
  adopt(await rpc('profile_save', { p_token: myToken(), p_name: name, p_avatar: avatar, p_color: color }));

export async function signOut() {
  await rpc('profile_sign_out', { p_token: myToken() });
  adopt({ signed_out: true });
}

// Leave whatever was here behind and carry on as a new, blank guest.
export function startAfresh() {
  resetIdentity();
}

const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

function sheet(label) {
  const dialog = make('dialog', 'profile account');
  dialog.setAttribute('aria-label', label);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  return dialog;
}

// NOT IN USE for now: email sign-in is switched off in the app, and nothing
// opens this. Kept, with the server side, for when it comes back.
// Sign in with an email address: a code is sent to it, and typed in here.
// For a guest this is also how the profile becomes an account. onDone(profile)
// runs once the device is signed in.
export function openSignIn({ guest, onDone }) {
  const dialog = sheet('Sign in');
  const title = make('h2', null, 'Sign in');
  const lede = make('p', 'hint', guest
    ? 'Sign in with your email to keep this profile and use it on any device. If you already have an account, this device’s rooms join it.'
    : 'Sign in with your email to get your profile and rooms back.');
  const error = make('p', 'message bad');
  error.setAttribute('role', 'alert');

  // step 1: the address
  const ask = make('form', 'card');
  const emailField = make('label', 'field');
  const email = make('input');
  email.type = 'email';
  email.required = true;
  email.autocomplete = 'email';
  email.inputMode = 'email';
  email.placeholder = 'you@example.com';
  emailField.append(make('span', null, 'Email'), email);
  const send = make('button', null, 'Email me a code');
  send.type = 'submit';
  ask.append(emailField, send);

  // step 2: the code
  const check = make('form', 'card');
  check.hidden = true;
  const codeField = make('label', 'field');
  const codeLabel = make('span');
  const code = make('input');
  code.type = 'text';
  code.required = true;
  code.inputMode = 'numeric';
  code.autocomplete = 'one-time-code';
  code.maxLength = 10;
  code.pattern = '[0-9 ]{6,10}';
  codeField.append(codeLabel, code);
  const confirm = make('button', null, 'Sign in');
  confirm.type = 'submit';
  const back = make('button', 'quiet', 'Use a different email');
  back.type = 'button';
  check.append(codeField, confirm, back);

  let address = '';
  ask.addEventListener('submit', async (event) => {
    event.preventDefault();
    address = email.value.trim().toLowerCase();
    if (!address) return;
    send.disabled = true;
    error.textContent = '';
    try {
      await auth('otp', { email: address, create_user: true });
      codeLabel.textContent = `The code we sent to ${address}`;
      ask.hidden = true;
      check.hidden = false;
      code.focus();
    } catch (failure) {
      error.textContent = failure.message;
    }
    send.disabled = false;
  });

  back.addEventListener('click', () => {
    check.hidden = true;
    ask.hidden = false;
    error.textContent = '';
    code.value = '';
    email.focus();
  });

  check.addEventListener('submit', async (event) => {
    event.preventDefault();
    const digits = code.value.replace(/\D/g, '');
    if (!digits) return;
    confirm.disabled = true;
    error.textContent = '';
    try {
      const session = await auth('verify', { type: 'email', email: address, token: digits });
      const profile = adopt(await rpc('profile_sign_in', { p_token: myToken() }, session.access_token));
      dialog.close();
      onDone?.(profile);
    } catch (failure) {
      error.textContent = /expired|invalid/i.test(failure.message) ? 'That code is wrong or has expired.' : failure.message;
      confirm.disabled = false;
    }
  });

  const cancel = make('button', 'quiet', 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', () => dialog.close());
  const foot = make('div', 'row end');
  foot.append(cancel);

  dialog.append(title, lede, ask, check, error, foot);
  dialog.showModal();
  email.focus();
}

// A temporary code that lets another device into this guest profile.
export async function openDeviceCode() {
  const dialog = sheet('Use this account on another device');
  const title = make('h2', null, 'Use on another device');
  const lede = make('p', 'hint', 'On the other device, open correspondence.lol and enter this code under “Sync account”. It works once, for ten minutes.');
  const code = make('button', 'code', '…');
  code.type = 'button';
  code.disabled = true;
  const tip = make('p', 'hint tip', 'Tap the code to copy it.');
  const error = make('p', 'message bad');
  error.setAttribute('role', 'alert');
  const done = make('button', null, 'Done');
  done.type = 'button';
  done.addEventListener('click', () => dialog.close());
  const foot = make('div', 'row end');
  foot.append(done);
  dialog.append(title, lede, code, tip, error, foot);
  dialog.showModal();
  try {
    copyable(code, await rpc('profile_code', { p_token: myToken() }));
    code.disabled = false;
  } catch (failure) {
    code.hidden = true;
    tip.hidden = true;
    error.textContent = failure.message;
  }
}
