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
  wind_speed?: number | null;
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
  wind_speed?: number | null;
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

  // Insert single primary device for single-unit IoT platform
  globalRef.mockDevices.set('main-esp32', {
    id: 'main-esp32',
    device_name: 'AeroBot Solar Unit (main-esp32)',
    location: 'Outdoor Field Station',
    firmware_version: '1.2',
    status: 'online',
    last_seen: new Date().toISOString(),
    pending_command: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Seed rich telemetry history for multi-timeframe enterprise charts
  const now = Date.now();
  for (let i = 48; i >= 0; i--) {
    const time = new Date(now - i * 30 * 60 * 1000).toISOString(); // Every 30 minutes
    const isDaylight = (i % 24) >= 6 && (i % 24) <= 18;
    globalRef.mockLogs.push({
      id: globalRef.logCounter++,
      device_id: 'main-esp32',
      temperature: parseFloat((25.2 + Math.sin(i / 4) * 4.5 + Math.random() * 0.8).toFixed(1)),
      humidity: parseFloat((62.0 + Math.cos(i / 5) * 12.0 + Math.random() * 1.5).toFixed(1)),
      soil: Math.min(100, Math.max(20, 58 + Math.round(Math.sin(i / 6) * 10 + (Math.random() - 0.5) * 3))),
      battery_voltage: parseFloat((12.85 + Math.sin(i / 12) * 0.45 + (isDaylight ? 0.2 : -0.1)).toFixed(2)),
      solar_status: isDaylight ? 'charging' : 'idle',
      rssi: -58 + Math.round((Math.random() - 0.5) * 8),
      wind_speed: parseFloat((3.8 + Math.sin(i / 3) * 3.2 + Math.random() * 1.2).toFixed(1)),
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
