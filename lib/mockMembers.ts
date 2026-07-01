export const MOCK_MEMBER_NAMES: Record<string, { name: string; initials: string }> = {
  "mock-user": { name: "Você (demo)", initials: "VC" },
  "u-ana":     { name: "Ana Souza",   initials: "AS" },
  "u-bruno":   { name: "Bruno Lima",  initials: "BL" },
  "u-carla":   { name: "Carla Dias",  initials: "CD" },
  "u-diego":   { name: "Diego Reis",  initials: "DR" },
  "user-ana":  { name: "Ana Souza",   initials: "AS" }, // legacy alias
};

export const DEMO_MEMBERS = [
  { id: "mock-user", name: "Você (demo)", initials: "VC" },
  { id: "u-ana",     name: "Ana Souza",   initials: "AS" },
  { id: "u-bruno",   name: "Bruno Lima",  initials: "BL" },
  { id: "u-carla",   name: "Carla Dias",  initials: "CD" },
  { id: "u-diego",   name: "Diego Reis",  initials: "DR" },
] as const;
