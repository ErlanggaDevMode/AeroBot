// /web/app/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Device, SensorLog } from '@/lib/supabase';

// Custom lightweight SVG Line Chart Component for beautiful, zero-dependency charts
function CustomLineChart({
  data,
  dataKey,
  color,
  title,
  unit = '',
}: {
  data: SensorLog[];
  dataKey: keyof SensorLog;
  color: string;
  title: string;
  unit?: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-slate-500 border border-slate-800 bg-slate-950/40 rounded-xl">
        No historical data
      </div>
    );
  }

  // Filter out null/undefined values
  const validData = data.filter((d) => d[dataKey] !== null && d[dataKey] !== undefined);
  const values = validData.map((d) => d[dataKey] as number);

  // Fallbacks if no data
  let min = values.length > 0 ? Math.min(...values) : 0;
  let max = values.length > 0 ? Math.max(...values) : 100;

  // Add padding to chart boundaries
  const diff = max - min;
  min = Math.max(0, min - (diff === 0 ? 5 : diff * 0.1));
  max = max + (diff === 0 ? 5 : diff * 0.1);

  // SVG dimensions
  const width = 500;
  const height = 150;
  const paddingX = 40;
  const paddingY = 20;

  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;

  // Map points to SVG coordinates
  const points = validData.map((d, index) => {
    const x = paddingX + (index / (validData.length - 1 || 1)) * chartWidth;
    const val = d[dataKey] as number;
    const y = paddingY + chartHeight - ((val - min) / (max - min || 1)) * chartHeight;
    return { x, y, value: val, time: new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
  });

  // Build path d attribute
  const pathD = points.reduce((acc, p, index) => {
    return acc + (index === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`);
  }, '');

  // Fill path for area gradient
  const fillD = points.length > 0 
    ? `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`
    : '';

  return (
    <div className="border border-slate-800/80 bg-slate-900/40 backdrop-blur-xl p-5 rounded-2xl flex flex-col transition duration-300 hover:border-slate-700/80">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-slate-400">{title}</h4>
        <span className="text-xs font-mono font-semibold" style={{ color }}>
          {values.length > 0 ? `${values[values.length - 1].toFixed(1)}${unit}` : '--'}
        </span>
      </div>
      
      <div className="relative w-full h-36">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="#1E293B" strokeDasharray="3,3" />
          <line x1={paddingX} y1={paddingY + chartHeight / 2} x2={width - paddingX} y2={paddingY + chartHeight / 2} stroke="#1E293B" strokeDasharray="3,3" />
          <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="#1E293B" />

          {/* Y Axis labels */}
          <text x={paddingX - 8} y={paddingY + 4} fill="#64748B" fontSize="10" textAnchor="end">{max.toFixed(0)}</text>
          <text x={paddingX - 8} y={paddingY + chartHeight / 2 + 4} fill="#64748B" fontSize="10" textAnchor="end">{((max + min) / 2).toFixed(0)}</text>
          <text x={paddingX - 8} y={height - paddingY + 4} fill="#64748B" fontSize="10" textAnchor="end">{min.toFixed(0)}</text>

          {/* X Axis labels (First, Middle, Last) */}
          {points.length > 1 && (
            <>
              <text x={points[0].x} y={height - 4} fill="#64748B" fontSize="9" textAnchor="start">{points[0].time}</text>
              <text x={points[Math.floor(points.length / 2)].x} y={height - 4} fill="#64748B" fontSize="9" textAnchor="middle">{points[Math.floor(points.length / 2)].time}</text>
              <text x={points[points.length - 1].x} y={height - 4} fill="#64748B" fontSize="9" textAnchor="end">{points[points.length - 1].time}</text>
            </>
          )}

          {/* Chart area fill */}
          {fillD && <path d={fillD} fill={`url(#grad-${dataKey})`} />}

          {/* Chart line */}
          {pathD && <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

          {/* Interactive dots */}
          {points.map((p, idx) => (
            <circle
              key={idx}
              cx={p.x}
              cy={p.y}
              r={idx === points.length - 1 ? '4' : '2'}
              fill={idx === points.length - 1 ? color : '#0F172A'}
              stroke={color}
              strokeWidth="1.5"
              className="cursor-pointer transition-all duration-200 hover:r-5"
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [devices, setDevices] = useState<(Device & { latest_log: SensorLog | null })[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('ESP32-001');
  const [history, setHistory] = useState<SensorLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [rebooting, setRebooting] = useState<boolean>(false);
  const [notif, setNotif] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchStatusAndHistory = async (deviceId: string) => {
    try {
      setLoading(true);
      // Fetch devices status
      const statusRes = await fetch('/api/device/status');
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setDevices(statusData);
        if (statusData.length > 0 && !statusData.some((d: any) => d.id === deviceId)) {
          setSelectedDeviceId(statusData[0].id);
          deviceId = statusData[0].id;
        }
      }

      // Fetch history
      const historyRes = await fetch(`/api/device/history?deviceId=${deviceId}&limit=24`);
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setHistory(historyData);
      }
    } catch (error) {
      console.error('Error refreshing dashboard telemetry:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatusAndHistory(selectedDeviceId);
    
    // Auto-refresh every 20 seconds
    const interval = setInterval(() => {
      fetchStatusAndHistory(selectedDeviceId);
    }, 20000);

    return () => clearInterval(interval);
  }, [selectedDeviceId]);

  const activeDevice = devices.find((d) => d.id === selectedDeviceId) || devices[0];
  const latestLog = activeDevice?.latest_log || null;

  // Handle Administrative Logout
  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
      });
      if (res.ok) {
        router.push('/login');
        router.refresh();
      }
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Handle reboot command dispatch
  const handleReboot = async () => {
    if (!activeDevice) return;
    setRebooting(true);
    try {
      const res = await fetch('/api/device/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: activeDevice.id, command: 'reboot' }),
      });
      if (res.ok) {
        setNotif({ text: 'Reboot command successfully queued for the device.', type: 'success' });
        // Refresh local status
        setTimeout(() => fetchStatusAndHistory(selectedDeviceId), 1000);
      } else {
        setNotif({ text: 'Failed to queue reboot command.', type: 'error' });
      }
    } catch (err) {
      setNotif({ text: 'Connection error while queueing command.', type: 'error' });
    } finally {
      setRebooting(false);
      setTimeout(() => setNotif(null), 5000);
    }
  };

  // Helper to approximate battery percentage
  const getBatteryPercentage = (voltage: number | null) => {
    if (voltage === null) return 0;
    if (voltage >= 13.6) return 100;
    if (voltage <= 10.0) return 0;
    return Math.round((voltage - 10.0) * (100 / 3.6));
  };

  // Helper for battery status color
  const getBatteryColor = (pct: number) => {
    if (pct < 15) return 'text-red-500 bg-red-950/20';
    if (pct < 50) return 'text-amber-500 bg-amber-950/20';
    return 'text-emerald-500 bg-emerald-950/20';
  };

  return (
    <div className="min-h-screen bg-[#070B13] text-slate-100 flex flex-col font-sans select-none">
      {/* Background radial glow */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-indigo-900/10 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="absolute bottom-10 right-1/4 w-[500px] h-[500px] bg-emerald-900/5 rounded-full blur-[120px] pointer-events-none -z-10" />

      {/* Header Panel */}
      <header className="border-b border-slate-900 bg-slate-950/40 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-emerald-400 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-indigo-500/20">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                AeroBot Cloud
              </h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">IoT Solar Platform</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => fetchStatusAndHistory(selectedDeviceId)}
              disabled={loading}
              className="p-2 border border-slate-800 bg-slate-900/50 rounded-xl text-slate-400 hover:text-white hover:border-slate-700 transition duration-200 disabled:opacity-50"
              title="Manual Telemetry Refresh"
            >
              <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
            <button
              onClick={handleLogout}
              className="p-2 border border-slate-800 bg-slate-900/50 rounded-xl text-slate-400 hover:text-rose-400 hover:border-rose-950/40 transition duration-200"
              title="Logout Session"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
            </button>
            <div className="text-xs text-right hidden sm:block">
              <p className="text-slate-400 font-medium">Automatic Monitoring</p>
              <p className="text-[10px] text-slate-500">Updates every 20 seconds</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 w-full flex-grow flex flex-col gap-8">
        
        {/* Banner Alert Notification */}
        {notif && (
          <div
            className={`p-4 rounded-xl border flex items-center gap-3 transition-all duration-300 ${
              notif.type === 'success'
                ? 'border-emerald-800/80 bg-emerald-950/20 text-emerald-300'
                : 'border-red-800/80 bg-red-950/20 text-red-300'
            }`}
          >
            {notif.type === 'success' ? (
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            <p className="text-sm font-medium">{notif.text}</p>
          </div>
        )}

        {/* Overview Stats Row */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="border border-slate-900 bg-slate-950/20 p-5 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Device Network</p>
              <h3 className="text-2xl font-bold mt-1 text-slate-200">{devices.length} Units</h3>
            </div>
            <div className="h-11 w-11 rounded-xl bg-slate-900 flex items-center justify-center text-slate-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="border border-slate-900 bg-slate-950/20 p-5 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Online Status</p>
              <h3 className="text-2xl font-bold mt-1 text-emerald-400">
                {devices.filter((d) => d.status === 'online').length} Online
              </h3>
            </div>
            <div className="h-11 w-11 rounded-xl bg-emerald-950/20 flex items-center justify-center text-emerald-400">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>
          </div>
          <div className="border border-slate-900 bg-slate-950/20 p-5 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Inactive Status</p>
              <h3 className="text-2xl font-bold mt-1 text-slate-400">
                {devices.filter((d) => d.status === 'offline').length} Offline
              </h3>
            </div>
            <div className="h-11 w-11 rounded-xl bg-slate-900 flex items-center justify-center text-slate-500">
              <span className="h-3 w-3 rounded-full bg-slate-700" />
            </div>
          </div>
          <div className="border border-slate-900 bg-slate-950/20 p-5 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Default Target</p>
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="mt-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-sm font-semibold text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.id} ({d.status})
                  </option>
                ))}
              </select>
            </div>
            <div className="h-11 w-11 rounded-xl bg-slate-900 flex items-center justify-center text-slate-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
          </div>
        </section>

        {/* Selected Device Data */}
        {activeDevice ? (
          <div className="flex flex-col gap-8">
            
            {/* Dashboard Telemetry Cards */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
              
              {/* Temperature Telemetry Card */}
              <div className="border border-slate-800/60 bg-slate-900/30 backdrop-blur-md p-5 rounded-2xl flex flex-col justify-between h-40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Temperature</span>
                  <div className="text-rose-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12V5a3 3 0 116 0v7a6 6 0 11-6 0z" />
                    </svg>
                  </div>
                </div>
                <div className="mt-2">
                  <h3 className="text-3xl font-bold tracking-tight">
                    {latestLog?.temperature !== null && latestLog?.temperature !== undefined
                      ? `${latestLog.temperature.toFixed(1)}°C`
                      : 'Error'}
                  </h3>
                </div>
                <div className="w-full bg-slate-950/60 h-1.5 rounded-full mt-3 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-orange-500 to-rose-500 transition-all duration-500" 
                    style={{ width: `${Math.min(100, Math.max(0, ((latestLog?.temperature || 0) / 50) * 100))}%` }}
                  />
                </div>
              </div>

              {/* Humidity Telemetry Card */}
              <div className="border border-slate-800/60 bg-slate-900/30 backdrop-blur-md p-5 rounded-2xl flex flex-col justify-between h-40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Humidity</span>
                  <div className="text-sky-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.105-7.5 12-7.5 12s-7.5-4.895-7.5-12a7.5 7.5 0 1115 0z" />
                    </svg>
                  </div>
                </div>
                <div className="mt-2">
                  <h3 className="text-3xl font-bold tracking-tight">
                    {latestLog?.humidity !== null && latestLog?.humidity !== undefined
                      ? `${latestLog.humidity.toFixed(0)}%`
                      : 'Error'}
                  </h3>
                </div>
                <div className="w-full bg-slate-950/60 h-1.5 rounded-full mt-3 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-500" 
                    style={{ width: `${latestLog?.humidity || 0}%` }}
                  />
                </div>
              </div>

              {/* Soil Moisture Telemetry Card */}
              <div className="border border-slate-800/60 bg-slate-900/30 backdrop-blur-md p-5 rounded-2xl flex flex-col justify-between h-40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Soil Moisture</span>
                  <div className="text-emerald-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.707-.707a4 4 0 10-5.658 0l-.707.707z" />
                    </svg>
                  </div>
                </div>
                <div className="mt-2">
                  <h3 className="text-3xl font-bold tracking-tight">
                    {latestLog?.soil !== null && latestLog?.soil !== undefined
                      ? `${latestLog.soil}%`
                      : 'Error'}
                  </h3>
                </div>
                <div className="w-full bg-slate-950/60 h-1.5 rounded-full mt-3 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-600 to-emerald-500 transition-all duration-500" 
                    style={{ width: `${latestLog?.soil || 0}%` }}
                  />
                </div>
              </div>

              {/* Battery Voltage Telemetry Card */}
              <div className="border border-slate-800/60 bg-slate-900/30 backdrop-blur-md p-5 rounded-2xl flex flex-col justify-between h-40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Battery (LiFePO4)</span>
                  <div className={getBatteryColor(getBatteryPercentage(latestLog?.battery_voltage || null)).split(' ')[0]}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                  </div>
                </div>
                <div className="mt-2">
                  <h3 className="text-3xl font-bold tracking-tight">
                    {latestLog?.battery_voltage !== null && latestLog?.battery_voltage !== undefined
                      ? `${latestLog.battery_voltage.toFixed(2)}V`
                      : 'Error'}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                    Estimated Level: {getBatteryPercentage(latestLog?.battery_voltage || null)}%
                  </p>
                </div>
                <div className="w-full bg-slate-950/60 h-1.5 rounded-full mt-3 overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-500" 
                    style={{ width: `${getBatteryPercentage(latestLog?.battery_voltage || null)}%` }}
                  />
                </div>
              </div>

              {/* Solar Charging Panel Telemetry Card */}
              <div className="border border-slate-800/60 bg-slate-900/30 backdrop-blur-md p-5 rounded-2xl flex flex-col justify-between h-40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Solar Charge</span>
                  <div className="text-amber-500 animate-pulse">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                    </svg>
                  </div>
                </div>
                <div className="mt-2">
                  <h3 className="text-3xl font-bold tracking-tight uppercase">
                    {latestLog?.solar_status === 'charging' ? 'Charging' : 'Idle'}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                    Signal RSSI: {latestLog?.rssi !== null && latestLog?.rssi !== undefined ? `${latestLog.rssi} dBm` : 'N/A'}
                  </p>
                </div>
                <div className="w-full mt-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
                    latestLog?.solar_status === 'charging' 
                      ? 'bg-amber-950/40 text-amber-400 border border-amber-800/40' 
                      : 'bg-slate-900/60 text-slate-400 border border-slate-800/40'
                  }`}>
                    Solar Status: {latestLog?.solar_status === 'charging' ? 'ACTIVE' : 'STANDBY'}
                  </span>
                </div>
              </div>

            </section>

            {/* Time-Series Charts Grid */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CustomLineChart data={history} dataKey="temperature" color="#F43F5E" title="Temperature History (°C)" unit="°C" />
              <CustomLineChart data={history} dataKey="humidity" color="#0EA5E9" title="Humidity History (%)" unit="%" />
              <CustomLineChart data={history} dataKey="soil" color="#10B981" title="Soil Moisture History (%)" unit="%" />
              <CustomLineChart data={history} dataKey="battery_voltage" color="#F59E0B" title="Battery Voltage History (V)" unit="V" />
            </section>

            {/* Hardware Status / Control Panel */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Technical Specifications */}
              <div className="border border-slate-900 bg-slate-950/20 p-6 rounded-2xl flex flex-col gap-4 col-span-2">
                <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" />
                  Hardware Specifications & Metadata
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mt-2">
                  <div className="flex justify-between border-b border-slate-900 pb-2">
                    <span className="text-slate-500">Device ID:</span>
                    <span className="font-mono font-semibold text-slate-300">{activeDevice.id}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-2">
                    <span className="text-slate-500">Device Name:</span>
                    <span className="font-semibold text-slate-300">{activeDevice.device_name}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-2">
                    <span className="text-slate-500">Deployment Location:</span>
                    <span className="font-semibold text-slate-300">{activeDevice.location || 'Not Configured'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-2">
                    <span className="text-slate-500">Firmware Version:</span>
                    <span className="font-mono font-semibold text-slate-300">v{activeDevice.firmware_version || '1.0'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-2 sm:border-0 sm:pb-0">
                    <span className="text-slate-500">Power Connection:</span>
                    <span className="font-semibold text-slate-300">Solar + 12V LiFePO4</span>
                  </div>
                  <div className="flex justify-between sm:border-0">
                    <span className="text-slate-500">Telemetry Last Update:</span>
                    <span className="font-semibold text-indigo-400">
                      {activeDevice.last_seen ? new Date(activeDevice.last_seen).toLocaleString() : 'Never'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Remote Device Command Panel */}
              <div className="border border-slate-900 bg-slate-950/20 p-6 rounded-2xl flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    Remote Diagnostics & Control
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Issue physical hardware commands directly to the ESP32 monitor. 
                    Commands are stored securely in the database and dispatched during the next client upload request.
                  </p>
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  {activeDevice.pending_command && (
                    <div className="text-xs py-2 px-3 rounded-lg bg-amber-950/25 border border-amber-800/40 text-amber-300 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
                        Command Queued: <code className="font-bold">{activeDevice.pending_command}</code>
                      </span>
                    </div>
                  )}

                  <button
                    onClick={handleReboot}
                    disabled={rebooting || activeDevice.status === 'offline'}
                    className="w-full py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none transition duration-200 rounded-xl text-sm font-semibold text-white shadow-lg shadow-rose-950/30 flex items-center justify-center gap-2"
                  >
                    <svg className={`w-4 h-4 ${rebooting ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                    {rebooting ? 'Sending...' : 'Queue Hardware Reboot'}
                  </button>
                </div>
              </div>

            </section>

          </div>
        ) : (
          <div className="h-96 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-3xl">
            <svg className="w-12 h-12 text-slate-600 animate-pulse" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1M5.25 11.833V15a2.5 2.5 0 002.5 2.5h8.5A2.5 2.5 0 0018.75 15v-4.167m-13.5 0L12 14l6.75-3.167" />
            </svg>
            <p className="text-slate-400 mt-4 font-medium">Scanning network for active monitors...</p>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-950 py-6 mt-12 bg-slate-950/20 text-slate-600 text-xs">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 AeroBot Cloud Platforms. All Rights Reserved.</p>
          <div className="flex gap-4">
            <a href="https://github.com" target="_blank" className="hover:text-slate-400 transition">GitHub</a>
            <span>•</span>
            <a href="/api/device/status" target="_blank" className="hover:text-slate-400 transition">Status API</a>
            <span>•</span>
            <span className="text-slate-500">Vercel Serverless Architecture</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
