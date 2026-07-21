// /web/lib/supabase.ts
// Secure and lightweight DB connector using standard fetch calls to Supabase REST API (PostgREST)
// Features a fail-safe in-memory mockup fallback when Supabase keys are not yet configured.

export interface Device {
  id: string;
  device_name: string;
  location: string | null;
  firmware_version: string | null;
  status: 'online' | 'offline';
  last_seen: string | null;
  pending_command: string | null;
  created_at: string;
  updated_at: string;
}

export interface SensorLog {
  id: number;
  device_id: string;
  temperature: number | null;
  humidity: number | null;
  soil: number | null;
  battery_voltage: number | null;
  solar_status: string | null;
  rssi: number | null;
  created_at: string;
}

export interface Alert {
  id: number;
  device_id: string;
  type: string;
  message: string;
  created_at: string;
}

// In-memory mock database for local testing when keys are missing or invalid
const isMockMode =
  !process.env.SUPABASE_URL ||
  process.env.SUPABASE_URL.includes('your-project-id') ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY.includes('your-supabase-service-role-key');

// Global mock state to persist across hot reloads in development
const globalRef = global as unknown as {
  mockDevices: Map<string, Device>;
  mockLogs: SensorLog[];
  mockAlerts: Alert[];
  logCounter: number;
  alertCounter: number;
};

if (!globalRef.mockDevices) {
  globalRef.mockDevices = new Map();
  globalRef.mockLogs = [];
  globalRef.mockAlerts = [];
  globalRef.logCounter = 1;
  globalRef.alertCounter = 1;

  // Insert default prototype device for UI rendering test
  globalRef.mockDevices.set('ESP32-001', {
    id: 'ESP32-001',
    device_name: 'Outdoor Solar Unit 1',
    location: 'Garden Greenhouse A',
    firmware_version: '1.1',
    status: 'online',
    last_seen: new Date().toISOString(),
    pending_command: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Seed default history
  const now = Date.now();
  for (let i = 24; i >= 0; i--) {
    const time = new Date(now - i * 60 * 60 * 1000).toISOString();
    globalRef.mockLogs.push({
      id: globalRef.logCounter++,
      device_id: 'ESP32-001',
      temperature: 24.5 + Math.sin(i / 3) * 3 + Math.random(),
      humidity: 65.0 + Math.cos(i / 4) * 8 + Math.random() * 2,
      soil: 50 + Math.round(Math.sin(i / 5) * 5),
      battery_voltage: 12.8 + Math.sin(i / 10) * 0.4,
      solar_status: i % 12 < 6 ? 'charging' : 'idle',
      rssi: -60 + Math.round(Math.random() * 10),
      created_at: time,
    });
  }
}

// Request Helper
async function supabaseFetch(path: string, options: RequestInit = {}) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase Error (${response.status}): ${errorText}`);
  }
  return response;
}

export async function upsertDevice(id: string, updates: Partial<Device>): Promise<Device> {
  const now = new Date().toISOString();
  if (isMockMode) {
    console.warn('⚠️ [Supabase DB] Running in mock-mode. Upserting device.');
    const existing = globalRef.mockDevices.get(id);
    const updated: Device = {
      id,
      device_name: existing?.device_name || `ESP32 Device (${id})`,
      location: existing?.location || 'Outdoor Station',
      firmware_version: updates.firmware_version ?? existing?.firmware_version ?? null,
      status: (updates.status as 'online' | 'offline') ?? existing?.status ?? 'online',
      last_seen: updates.last_seen ?? now,
      pending_command: updates.pending_command !== undefined ? updates.pending_command : (existing?.pending_command ?? null),
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    globalRef.mockDevices.set(id, updated);
    return updated;
  }

  const payload = {
    id,
    ...updates,
    updated_at: now,
  };

  const res = await supabaseFetch('devices?id=eq.' + encodeURIComponent(id), {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return data[0];
}

export async function getDevices(): Promise<Device[]> {
  if (isMockMode) {
    return Array.from(globalRef.mockDevices.values());
  }

  const res = await supabaseFetch('devices?select=*&order=id.asc');
  return res.json();
}

export async function getDevice(id: string): Promise<Device | null> {
  if (isMockMode) {
    return globalRef.mockDevices.get(id) || null;
  }

  const res = await supabaseFetch(`devices?id=eq.${encodeURIComponent(id)}&select=*`);
  const data = await res.json();
  return data[0] || null;
}

export async function insertSensorLog(log: Omit<SensorLog, 'id' | 'created_at'>): Promise<SensorLog> {
  const now = new Date().toISOString();
  if (isMockMode) {
    const newLog: SensorLog = {
      id: globalRef.logCounter++,
      ...log,
      created_at: now,
    };
    globalRef.mockLogs.push(newLog);
    // Keep logs cache capped at 1000 for efficiency
    if (globalRef.mockLogs.length > 1000) {
      globalRef.mockLogs.shift();
    }
    return newLog;
  }

  const res = await supabaseFetch('sensor_logs', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify(log),
  });
  const data = await res.json();
  return data[0];
}

export async function getSensorLogs(device_id: string, limit = 100): Promise<SensorLog[]> {
  if (isMockMode) {
    return globalRef.mockLogs
      .filter((l) => l.device_id === device_id)
      .slice(-limit)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  const res = await supabaseFetch(
    `sensor_logs?device_id=eq.${encodeURIComponent(device_id)}&select=*&order=created_at.desc&limit=${limit}`
  );
  const data: SensorLog[] = await res.json();
  // Return in chronological order for charts
  return data.reverse();
}

export async function insertAlert(alert: Omit<Alert, 'id' | 'created_at'>): Promise<Alert> {
  const now = new Date().toISOString();
  if (isMockMode) {
    const newAlert: Alert = {
      id: globalRef.alertCounter++,
      ...alert,
      created_at: now,
    };
    globalRef.mockAlerts.push(newAlert);
    return newAlert;
  }

  const res = await supabaseFetch('alerts', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify(alert),
  });
  const data = await res.json();
  return data[0];
}

export async function getAlerts(device_id?: string, limit = 20): Promise<Alert[]> {
  if (isMockMode) {
    const list = device_id ? globalRef.mockAlerts.filter((a) => a.device_id === device_id) : globalRef.mockAlerts;
    return list.slice(-limit).reverse();
  }

  const query = device_id ? `device_id=eq.${encodeURIComponent(device_id)}&` : '';
  const res = await supabaseFetch(`alerts?${query}select=*&order=created_at.desc&limit=${limit}`);
  return res.json();
}
