/**
 * mockClients — shared demo client data (localStorage-backed for status edits).
 */

export interface MockClient {
  id: string;
  name: string;
  code: string;
  sector: string;
  contact: string;
  phone: string;
  status: "active" | "inactive";
  projects: number;
  tasks: number;
  delivered: number;
  hours: number;          // used hours
  hoursContracted: number; // contracted hours (0 = not configured)
  weekly: number[];        // activity per week
  color: string;
}

const SEED: MockClient[] = [
  { id: "c1", name: "Medway Educação", code: "MED-001", sector: "Educação Médica", contact: "contato@medway.com.br", phone: "(11) 4000-1234", status: "active", projects: 3, tasks: 24, delivered: 18, hours: 47, hoursContracted: 80, weekly: [30, 55, 40, 70, 60, 80, 50, 65], color: "#00205B" },
  { id: "c2", name: "Hospital Sírio-Libanês", code: "HSL-002", sector: "Saúde", contact: "ti@hsl.org.br", phone: "(11) 3155-0200", status: "active", projects: 2, tasks: 15, delivered: 10, hours: 32, hoursContracted: 60, weekly: [20, 35, 50, 45, 30, 55, 40, 38], color: "#01CFB5" },
  { id: "c3", name: "Revalida Brasil", code: "REV-003", sector: "Educação", contact: "projetos@revalida.com.br", phone: "(21) 2200-3344", status: "active", projects: 1, tasks: 8, delivered: 3, hours: 12, hoursContracted: 0, weekly: [10, 15, 20, 12, 18, 22, 14, 16], color: "#407EC9" },
  { id: "c4", name: "CRM-SP", code: "CRM-004", sector: "Conselho Regional", contact: "comunicacao@crm-sp.org.br", phone: "(11) 4000-9876", status: "inactive", projects: 1, tasks: 5, delivered: 5, hours: 20, hoursContracted: 20, weekly: [25, 30, 15, 20, 10, 5, 8, 12], color: "#AC145A" },
];

function load(): MockClient[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = localStorage.getItem("mwr_clients");
    if (raw) return JSON.parse(raw);
  } catch {}
  if (typeof window !== "undefined") localStorage.setItem("mwr_clients", JSON.stringify(SEED));
  return SEED;
}
function save(list: MockClient[]) {
  if (typeof window !== "undefined") localStorage.setItem("mwr_clients", JSON.stringify(list));
}

export const mockClients = {
  list(): MockClient[] { return load(); },
  get(id: string): MockClient | null { return load().find((c) => c.id === id) ?? null; },
  update(id: string, updates: Partial<MockClient>) {
    const all = load();
    const idx = all.findIndex((c) => c.id === id);
    if (idx >= 0) { all[idx] = { ...all[idx], ...updates }; save(all); }
  },
  create(input: { name: string; sector?: string; code?: string }): MockClient {
    const all = load();
    const item: MockClient = {
      id: "c" + (Date.now() % 100000), name: input.name, code: input.code || `CLI-${all.length + 1}`,
      sector: input.sector || "—", contact: "", phone: "", status: "active",
      projects: 0, tasks: 0, delivered: 0, hours: 0, hoursContracted: 0,
      weekly: [0, 0, 0, 0, 0, 0, 0, 0], color: "#407EC9",
    };
    all.unshift(item);
    save(all);
    return item;
  },
};
