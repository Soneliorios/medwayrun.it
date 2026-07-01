/**
 * Mock user store — credentials and access management for demo/preview mode.
 * Hardcoded users are never overwritable; dynamic users live in localStorage.
 */

export type MockUserRole = "superadmin" | "admin" | "user" | "revoked";

export interface MockUser {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: MockUserRole;
  /** djb2 hash of password — mock only */
  _ph: string;
}

export interface PendingRegistration {
  email: string;
  full_name: string;
  _ph: string;
  code: string;
  expiresAt: number;
}

// ── Hash ───────────────────────────────────────────────────────────────────────

export function mockHash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

// ── Hardcoded users (protected, never deletable) ───────────────────────────────

const HARDCODED_USERS: MockUser[] = [
  {
    id: "superadmin-sonelio",
    email: "sonelio.filho@medway.com.br",
    full_name: "Sonelio Filho",
    avatar_url: null,
    role: "superadmin",
    _ph: "1kxera",
  },
];

const HARDCODED_IDS = new Set(HARDCODED_USERS.map((u) => u.id));

// ── Dynamic user store (localStorage) ─────────────────────────────────────────

const DYNAMIC_KEY = "mwr_mock_users";
const PENDING_KEY = "mwr_pending_reg";

function loadDynamicUsers(): MockUser[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(DYNAMIC_KEY) ?? "[]") as MockUser[];
  } catch {
    return [];
  }
}

function saveDynamicUsers(users: MockUser[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DYNAMIC_KEY, JSON.stringify(users));
}

export function getAllMockUsers(): MockUser[] {
  const dynamic = loadDynamicUsers();
  const dynamicIds = new Set(dynamic.map((u) => u.id));
  // Hardcoded always win if there's a clash
  return [...HARDCODED_USERS.filter((u) => !dynamicIds.has(u.id)), ...dynamic];
}

export function addMockUser(user: MockUser): void {
  if (HARDCODED_IDS.has(user.id)) return;
  const dynamic = loadDynamicUsers().filter((u) => u.id !== user.id);
  saveDynamicUsers([...dynamic, user]);
}

export function updateMockUserRole(id: string, role: MockUserRole): void {
  if (HARDCODED_IDS.has(id)) return; // protect superadmin
  const dynamic = loadDynamicUsers().map((u) => u.id === id ? { ...u, role } : u);
  saveDynamicUsers(dynamic);
}

export function removeMockUser(id: string): void {
  if (HARDCODED_IDS.has(id)) return;
  saveDynamicUsers(loadDynamicUsers().filter((u) => u.id !== id));
}

// ── Auth helpers ────────────────────────────────────────────────────────────────

export function checkMockCredentials(email: string, password: string): MockUser | null {
  const user = getAllMockUsers().find(
    (u) => u.email.toLowerCase() === email.toLowerCase().trim()
  );
  if (!user) return null;
  if (user.role === "revoked") return null;
  if (user._ph !== mockHash(password)) return null;
  return user;
}

export function getMockUser(id: string): MockUser | undefined {
  return getAllMockUsers().find((u) => u.id === id);
}

// ── Pending registration ────────────────────────────────────────────────────────

function loadPendingRegs(): PendingRegistration[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]") as PendingRegistration[];
  } catch {
    return [];
  }
}

export function setPendingReg(data: PendingRegistration): void {
  if (typeof window === "undefined") return;
  const list = loadPendingRegs().filter((p) => p.email !== data.email);
  localStorage.setItem(PENDING_KEY, JSON.stringify([...list, data]));
}

export function getPendingReg(email: string): PendingRegistration | null {
  const entry = loadPendingRegs().find(
    (p) => p.email.toLowerCase() === email.toLowerCase()
  );
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) return null; // expired
  return entry;
}

export function clearPendingReg(email: string): void {
  if (typeof window === "undefined") return;
  const list = loadPendingRegs().filter((p) => p.email !== email);
  localStorage.setItem(PENDING_KEY, JSON.stringify(list));
}

export function completePendingReg(email: string): MockUser | null {
  const pending = getPendingReg(email);
  if (!pending) return null;

  const newUser: MockUser = {
    id: "user-" + Math.random().toString(36).slice(2, 10),
    email: pending.email,
    full_name: pending.full_name,
    avatar_url: null,
    role: "user",
    _ph: pending._ph,
  };

  addMockUser(newUser);
  clearPendingReg(email);
  return newUser;
}

// ── Cookie-based session helpers (client-side only) ────────────────────────────

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
