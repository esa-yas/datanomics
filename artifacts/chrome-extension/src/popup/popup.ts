import { signIn, signOut, getProfile } from '../lib/supabase';
import { isConfigured } from '../lib/config';

const authView = document.getElementById('auth-view')!;
const loggedInView = document.getElementById('logged-in-view')!;
const authError = document.getElementById('auth-error')!;
const userName = document.getElementById('user-name')!;

async function refresh() {
  if (!isConfigured()) {
    authError.textContent = 'Extension not configured — rebuild with .env VITE_SUPABASE_* vars';
    authError.classList.remove('hidden');
    return;
  }

  try {
    const profile = await getProfile();
    if (profile) {
      authView.classList.add('hidden');
      loggedInView.classList.remove('hidden');
      userName.textContent = `${profile.display_name} (${profile.role?.replace(/_/g, ' ')})`;
    } else {
      authView.classList.remove('hidden');
      loggedInView.classList.add('hidden');
    }
  } catch {
    authView.classList.remove('hidden');
    loggedInView.classList.add('hidden');
  }
}

document.getElementById('login-btn')!.addEventListener('click', async () => {
  authError.classList.add('hidden');
  const email = (document.getElementById('email') as HTMLInputElement).value.trim();
  const password = (document.getElementById('password') as HTMLInputElement).value;
  if (!email || !password) {
    authError.textContent = 'Email and password required';
    authError.classList.remove('hidden');
    return;
  }
  try {
    await signIn(email, password);
    await refresh();
  } catch (err) {
    authError.textContent = err instanceof Error ? err.message : 'Sign in failed';
    authError.classList.remove('hidden');
  }
});

document.getElementById('logout-btn')!.addEventListener('click', async () => {
  await signOut();
  await refresh();
});

document.getElementById('open-panel')!.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
  window.close();
});

void refresh();
