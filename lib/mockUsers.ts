/**
 * Mock user store — credentials for demo/preview mode only.
 * Add new users here; never use in production.
 */

export interface MockUser {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: "superadmin" | "admin" | "user";
  /** djb2 hash of password — mock only */
  _ph: string;
}

function mockHash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

const MOCK_USERS: MockUser[] = [
  {
    id: "superadmin-sonelio",
    email: "sonelio.filho@medway.com.br",
    full_name: "Sonelio Filho",
    avatar_url: null,
    role: "superadmin",
    _ph: "1kxera",
  },
];

export function checkMockCredentials(email: string, password: string): MockUser | null {
  const user = MOCK_USERS.find(
    (u) => u.email.toLowerCase() === email.toLowerCase().trim()
  );
  if (!user) return null;
  if (user._ph !== mockHash(password)) return null;
  return user;
}

export function getMockUser(id: string): MockUser | undefined {
  return MOCK_USERS.find((u) => u.id === id);
}

// ── Cookie-based session helpers (client-side only) ────────────────────────

const SESSION_COOKIE = "mwr_session";

export function setMockSession(userId: string): void {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 7; // 7 days
  document.cookie = `${SESSION_COOKIE}=${userId}; path=/; SameSite=Lax; max-age=${maxAge}`;
}

export function clearMockSession(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
}

export function readMockSessionCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
