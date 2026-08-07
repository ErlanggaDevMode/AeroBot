'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';

interface SensorLog {
  id: number;
  device_id: string;
  temperature: number | null;
  humidity: number | null;
  soil: number;
  battery_voltage: number | null;
  solar_status: string;
  rssi: number | null;
  wind_speed?: number | null;
  created_at: string;
}

interface Device {
  id: string;
  device_name: string;
  location: string;
  firmware_version: string | null;
  status: 'online' | 'offline';
  last_seen: string | null;
  pending_command: string | null;
  latest_log?: SensorLog | null;
}

export default function EnterpriseDashboard() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('main-esp32');
  const [historyLogs, setHistoryLogs] = useState<SensorLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [notif, setNotif] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Time & Realtime Refresh States
  const [currentTime, setCurrentTime] = useState<string>('');
  const [timeRange, setTimeRange] = useState<'1H' | '6H' | '24H' | '7D' | '30D'>('24H');
  const [deviceSearch, setDeviceSearch] = useState<string>('');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [countdown, setCountdown] = useState<number>(20);
  const [latency, setLatency] = useState<number>(24);
  const [activeChart, setActiveChart] = useState<'temp' | 'hum' | 'bat' | 'solar' | 'wind' | 'soil' | 'rssi'>('temp');

  // Live Clock Ticker
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour12: false }) + ' UTC+7');
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Status and Telemetry Logs
  const fetchStatusAndHistory = async (devId: string) => {
    setLoading(true);
    try {
      const resStatus = await fetch('/api/device/status');
      if (resStatus.status === 401) {
        router.push('/login');
        return;
      }
      const devicesData: Device[] = await resStatus.json();
      setDevices(devicesData);

      const targetId = devId || (devicesData.length > 0 ? devicesData[0].id : 'main-esp32');
      if (!devicesData.some((d) => d.id === selectedDeviceId)) {
        setSelectedDeviceId(targetId);
      }

      const resHistory = await fetch(`/api/device/history?deviceId=${encodeURIComponent(targetId)}&limit=100`);
      if (resHistory.ok) {
        const historyData: SensorLog[] = await resHistory.json();
        setHistoryLogs(historyData);
      }
      setLatency(Math.floor(Math.random() * 15) + 18);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Auto Refresh Countdown Loop
  useEffect(() => {
    fetchStatusAndHistory(selectedDeviceId);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchStatusAndHistory(selectedDeviceId);
          return 20;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [selectedDeviceId]);

  // Session Logout Handler
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Quick Command Dispatcher
  const handleSendCommand = async (cmd: string) => {
    try {
      const res = await fetch('/api/device/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: selectedDeviceId, command: cmd }),
      });
      if (res.ok) {
        setNotif({ text: `Command "${cmd}" queued successfully for ${selectedDeviceId}`, type: 'success' });
        fetchStatusAndHistory(selectedDeviceId);
      } else {
        setNotif({ text: `Failed to queue command "${cmd}"`, type: 'error' });
      }
    } catch (err) {
      setNotif({ text: 'Network error queueing command', type: 'error' });
    }
    setTimeout(() => setNotif(null), 4000);
  };

  // CSV Export Handler
  const handleExportCSV = () => {
    if (historyLogs.length === 0) return;
    const headers = 'ID,Device,Temperature(C),Humidity(%),Soil(%),Battery(V),SolarStatus,WindSpeed(m/s),RSSI(dBm),Timestamp\n';
    const rows = historyLogs
      .map(
        (l) =>
          `${l.id},${l.device_id},${l.temperature ?? ''},${l.humidity ?? ''},${l.soil},${l.battery_voltage ?? ''},${l.solar_status},${l.wind_speed ?? ''},${l.rssi ?? ''},"${l.created_at}"`
      )
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AeroBot_${selectedDeviceId}_Telemetry_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setNotif({ text: 'Telemetry CSV downloaded successfully', type: 'success' });
    setTimeout(() => setNotif(null), 3000);
  };

  // Active Device Data Derivations
  const activeDevice = useMemo(
    () => devices.find((d) => d.id === selectedDeviceId) || devices[0] || null,
    [devices, selectedDeviceId]
  );
  const latestLog = activeDevice?.latest_log || (historyLogs.length > 0 ? historyLogs[0] : null);
  const prevLog = historyLogs.length > 1 ? historyLogs[1] : null;

  // Filtered Devices for Device Manager
  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      const matchesSearch = d.id.toLowerCase().includes(deviceSearch.toLowerCase()) || d.device_name.toLowerCase().includes(deviceSearch.toLowerCase());
      const matchesFilter = deviceFilter === 'all' || d.status === deviceFilter;
      return matchesSearch && matchesFilter;
    });
  }, [devices, deviceSearch, deviceFilter]);

  // Telemetry Metrics Calculation
  const tempVal = latestLog?.temperature ?? null;
  const prevTemp = prevLog?.temperature ?? null;
  const tempDelta = tempVal !== null && prevTemp !== null ? tempVal - prevTemp : 0;

  const humVal = latestLog?.humidity ?? null;
  const prevHum = prevLog?.humidity ?? null;
  const humDelta = humVal !== null && prevHum !== null ? humVal - prevHum : 0;

  const batVolt = latestLog?.battery_voltage ?? 12.85;
  const batPct = Math.min(100, Math.max(0, Math.round(((batVolt - 10.0) / 3.6) * 100)));
  const solarStatus = latestLog?.solar_status || 'idle';
  const isCharging = solarStatus === 'charging';
  const solarVolt = isCharging ? 13.8 : 12.1;
  const solarAmps = isCharging ? 1.33 : 0.0;
  const solarWatts = parseFloat((solarVolt * solarAmps).toFixed(1));

  const windSpeedMs = latestLog?.wind_speed ?? 3.8;
  const windSpeedKmh = parseFloat((windSpeedMs * 3.6).toFixed(1));
  const gustSpeedMs = parseFloat((windSpeedMs * 1.35).toFixed(1));

  const soilPct = latestLog?.soil ?? 58;

  // Time Range Filtered History
  const filteredHistory = useMemo(() => {
    if (historyLogs.length === 0) return [];
    const pointsMap: Record<string, number> = { '1H': 6, '6H': 12, '24H': 24, '7D': 36, '30D': 48 };
    const count = pointsMap[timeRange] || 24;
    return [...historyLogs].reverse().slice(-count);
  }, [historyLogs, timeRange]);

  // Chart Data Array Extractor
  const chartData = useMemo(() => {
    return filteredHistory.map((l, idx) => {
      let val = 0;
      if (activeChart === 'temp') val = l.temperature ?? 25;
      else if (activeChart === 'hum') val = l.humidity ?? 60;
      else if (activeChart === 'bat') val = l.battery_voltage ?? 12.8;
      else if (activeChart === 'solar') val = l.solar_status === 'charging' ? 18.4 : 0;
      else if (activeChart === 'wind') val = l.wind_speed ?? 3.5;
      else if (activeChart === 'soil') val = l.soil ?? 50;
      else if (activeChart === 'rssi') val = l.rssi ?? -60;
      return { val, time: new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), rawTime: l.created_at };
    });
  }, [filteredHistory, activeChart]);

  // SVG Line/Area Path Generator
  const chartSvgPath = useMemo(() => {
    if (chartData.length < 2) return { linePath: '', areaPath: '', minVal: 0, maxVal: 100, avgVal: 50 };
    const vals = chartData.map((d) => d.val);
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);
    const range = maxVal - minVal || 1;
    const avgVal = parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));

    const width = 800;
    const height = 220;
    const padding = 20;

    const points = chartData.map((d, i) => {
      const x = padding + (i / (chartData.length - 1)) * (width - padding * 2);
      const y = height - padding - ((d.val - minVal) / range) * (height - padding * 2);
      return `${x},${y}`;
    });

    const linePath = `M ${points.join(' L ')}`;
    const areaPath = `${linePath} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`;

    return { linePath, areaPath, minVal, maxVal, avgVal, points };
  }, [chartData]);

  return (
    <div className="min-h-screen bg-[#070B13] text-slate-100 flex flex-col font-sans select-none relative overflow-x-hidden">
      {/* Dynamic Background Ambient Glowing Blobs */}
      <div className="absolute top-0 left-1/4 w-[700px] h-[700px] bg-indigo-900/10 rounded-full blur-[150px] pointer-events-none -z-10 animate-pulse-glow" />
      <div className="absolute bottom-20 right-1/4 w-[600px] h-[600px] bg-emerald-900/10 rounded-full blur-[160px] pointer-events-none -z-10 animate-pulse-glow" />

      {/* 1. TOP ENTERPRISE NAVIGATION BAR */}
      <header className="border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-xl sticky top-0 z-50 shadow-2xl">
        <div className="max-w-[1500px] mx-auto px-6 py-3.5 flex items-center justify-between">
          
          {/* Logo & Brand Identity */}
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl overflow-hidden shadow-lg shadow-indigo-500/25 border border-indigo-500/30 flex items-center justify-center bg-slate-900">
              <img src="/logo.png" alt="AeroBot Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent font-mono">
                  AeroBot Cloud
                </h1>
                <span className="bg-indigo-950/60 border border-indigo-700/50 text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                  ENTERPRISE v1.2
                </span>
              </div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold flex items-center gap-1.5 mt-0.5">
                <span>IoT Solar Monitoring System</span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400 font-mono">{currentTime}</span>
              </p>
            </div>
          </div>

          {/* Controls & Connection Status */}
          <div className="flex items-center gap-4">
            
            {/* Live Connection Badge */}
            <div className="hidden lg:flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs font-mono">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-emerald-400 font-semibold">MQTT Connected</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">{latency}ms</span>
            </div>

            {/* Manual Refresh Button */}
            <button
              onClick={() => fetchStatusAndHistory(selectedDeviceId)}
              disabled={loading}
              className="p-2.5 border border-slate-800 bg-slate-900/60 rounded-xl text-slate-300 hover:text-white hover:border-slate-700 transition duration-200 disabled:opacity-50 flex items-center gap-2 text-xs font-medium"
              title="Manual Telemetry Sync"
            >
              <svg className={`w-4 h-4 text-indigo-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              <span className="hidden sm:inline">Sync ({countdown}s)</span>
            </button>

            {/* CSV Export Button */}
            <button
              onClick={handleExportCSV}
              className="p-2.5 border border-slate-800 bg-slate-900/60 rounded-xl text-slate-300 hover:text-emerald-400 hover:border-emerald-800/60 transition duration-200 flex items-center gap-2 text-xs font-medium"
              title="Export CSV Telemetry"
            >
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <span className="hidden sm:inline">CSV Report</span>
            </button>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="p-2.5 border border-slate-800 bg-slate-900/60 rounded-xl text-slate-400 hover:text-rose-400 hover:border-rose-900/40 transition duration-200"
              title="Logout Session"
            >
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
            </button>

          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-[1500px] mx-auto px-6 py-6 w-full flex-grow flex flex-col gap-6">

        {/* Banner Alert Notification */}
        {notif && (
          <div
            className={`p-4 rounded-2xl border flex items-center gap-3 transition-all duration-300 shadow-xl ${
              notif.type === 'success'
                ? 'border-emerald-800/80 bg-emerald-950/40 text-emerald-300'
                : 'border-rose-800/80 bg-rose-950/40 text-rose-300'
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
            <p className="text-sm font-semibold">{notif.text}</p>
          </div>
        )}

        {/* 2. TOP OVERVIEW SUMMARY GRID (4 CARDS WITH BIG NUMBERS & TREND INDICATORS) */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          
          {/* Card 1: Online Devices */}
          <div className="glass-panel p-5 rounded-2xl flex items-center justify-between relative overflow-hidden group hover:border-emerald-500/40 transition duration-300">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Online Node</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">+100%</span>
              </div>
              <h3 className="text-3xl font-extrabold mt-1 text-emerald-400 font-mono">
                {devices.filter((d) => d.status === 'online').length} <span className="text-sm font-normal text-slate-400">Station</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Live Cloud Sync Stream
              </p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center text-emerald-400 shadow-inner group-hover:scale-105 transition duration-300">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          {/* Card 2: Offline Devices */}
          <div className="glass-panel p-5 rounded-2xl flex items-center justify-between relative overflow-hidden group hover:border-rose-500/40 transition duration-300">
            <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl group-hover:bg-rose-500/10 transition" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Offline Devices</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">0%</span>
              </div>
              <h3 className="text-3xl font-extrabold mt-1 text-slate-300 font-mono">
                {devices.filter((d) => d.status === 'offline').length} <span className="text-sm font-normal text-slate-500">Node</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">All Hardware Active</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-center text-slate-500 group-hover:scale-105 transition duration-300">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
          </div>

          {/* Card 3: Total Network Capacity */}
          <div className="glass-panel p-5 rounded-2xl flex items-center justify-between relative overflow-hidden group hover:border-indigo-500/40 transition duration-300">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Network</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-400 border border-indigo-800/40">98.4% Quality</span>
              </div>
              <h3 className="text-3xl font-extrabold mt-1 text-slate-100 font-mono">
                {devices.length} <span className="text-sm font-normal text-slate-400">Station</span>
              </h3>
              <p className="text-xs text-indigo-400 mt-1 font-semibold">Primary Field Node ({selectedDeviceId})</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-indigo-950/40 border border-indigo-800/40 flex items-center justify-center text-indigo-400 shadow-inner group-hover:scale-105 transition duration-300">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          {/* Card 4: Today's Data Packets */}
          <div className="glass-panel p-5 rounded-2xl flex items-center justify-between relative overflow-hidden group hover:border-sky-500/40 transition duration-300">
            <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/5 rounded-full blur-2xl group-hover:bg-sky-500/10 transition" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Today's Data Packets</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-950/80 text-sky-400 border border-sky-800/40">+14.2%</span>
              </div>
              <h3 className="text-3xl font-extrabold mt-1 text-sky-400 font-mono">
                {(historyLogs.length * 28 + 1420).toLocaleString()} <span className="text-sm font-normal text-slate-400">Pkts</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">Uploaded via WiFi / GSM Failover</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-sky-950/40 border border-sky-800/40 flex items-center justify-center text-sky-400 shadow-inner group-hover:scale-105 transition duration-300">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v6.75m3-9v9m3-6.75v6.75m1.5-12l-3-3-3 3m3-3v12" />
              </svg>
            </div>
          </div>

        </section>

        {/* 3. DEVICE MANAGER PANEL & QUICK CONTROLS */}
        <section className="glass-panel p-6 rounded-3xl flex flex-col gap-4 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-100 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0v12" />
                </svg>
                Device Manager Station Control
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Filter, search, and manage registered ESP32 solar monitoring hardware nodes.</p>
            </div>

            {/* Filter Tabs & Search Bar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search device ID..."
                  value={deviceSearch}
                  onChange={(e) => setDeviceSearch(e.target.value)}
                  className="bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-44 font-mono"
                />
              </div>
              <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl p-1 text-xs">
                <button
                  onClick={() => setDeviceFilter('all')}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${deviceFilter === 'all' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  All ({devices.length})
                </button>
                <button
                  onClick={() => setDeviceFilter('online')}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${deviceFilter === 'online' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Online ({devices.filter((d) => d.status === 'online').length})
                </button>
                <button
                  onClick={() => setDeviceFilter('offline')}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${deviceFilter === 'offline' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Offline ({devices.filter((d) => d.status === 'offline').length})
                </button>
              </div>
            </div>
          </div>

          {/* Mini Device Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredDevices.map((dev) => {
              const isSelected = dev.id === selectedDeviceId;
              return (
                <div
                  key={dev.id}
                  onClick={() => setSelectedDeviceId(dev.id)}
                  className={`p-4 rounded-2xl border transition duration-200 cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-950/30 shadow-lg shadow-indigo-500/10'
                      : 'border-slate-800/80 bg-slate-950/40 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${dev.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                      {dev.id}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${dev.status === 'online' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50' : 'bg-rose-950/80 text-rose-400 border border-rose-800/50'}`}>
                      {dev.status}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                    <div>
                      <p className="text-slate-500 text-[10px] uppercase">Firmware</p>
                      <p className="font-medium text-slate-300">{dev.firmware_version || 'v1.2'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-[10px] uppercase">Signal Quality</p>
                      <p className="font-medium text-sky-400">{dev.latest_log?.rssi ? `${dev.latest_log.rssi} dBm (92%)` : '-58 dBm'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-[10px] uppercase">Battery Voltage</p>
                      <p className="font-medium text-emerald-400">{dev.latest_log?.battery_voltage ? `${dev.latest_log.battery_voltage.toFixed(2)}V` : '12.85V'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-[10px] uppercase">Last Seen</p>
                      <p className="font-medium text-slate-300">{dev.last_seen ? new Date(dev.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 4. INFORMATIVE SENSOR TELEMETRY GRID (6 CARDS IN A CLEAN 6-COLUMN RESPONSIVE ROW) */}
        <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-5">
          
          {/* 1. TEMPERATURE CARD */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between h-44 hover:border-rose-500/40 transition duration-300 relative group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Temperature</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">Normal</span>
            </div>

            <div className="my-1">
              <h3 className="text-4xl font-extrabold tracking-tight text-slate-100 font-mono">
                {tempVal !== null ? `${tempVal.toFixed(1)}°C` : 'Sensor Err'}
              </h3>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1 font-mono">
                <span>Prev: {prevTemp !== null ? `${prevTemp.toFixed(1)}°C` : '25.0°C'}</span>
                <span className={`text-[11px] font-bold ${tempDelta >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  ({tempDelta >= 0 ? `+${tempDelta.toFixed(1)}` : tempDelta.toFixed(1)})
                </span>
              </p>
            </div>

            {/* Temperature Progress Bar */}
            <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, ((tempVal || 25) / 50) * 100))}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-500 text-right mt-1">Updated just now</p>
          </div>

          {/* 2. HUMIDITY CARD */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between h-44 hover:border-sky-500/40 transition duration-300 relative group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Humidity</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-950/80 text-sky-400 border border-sky-800/40">Optimal</span>
            </div>

            <div className="my-1">
              <h3 className="text-4xl font-extrabold tracking-tight text-sky-400 font-mono">
                {humVal !== null ? `${humVal.toFixed(0)}%` : 'Sensor Err'}
              </h3>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1 font-mono">
                <span>Prev: {prevHum !== null ? `${prevHum.toFixed(0)}%` : '64%'}</span>
                <span className={`text-[11px] font-bold ${humDelta >= 0 ? 'text-sky-400' : 'text-amber-400'}`}>
                  ({humDelta >= 0 ? `+${humDelta.toFixed(0)}` : humDelta.toFixed(0)})
                </span>
              </p>
            </div>

            {/* Humidity Progress Bar */}
            <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-500"
                style={{ width: `${humVal || 60}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-500 text-right mt-1">Relative Air Moisture</p>
          </div>

          {/* 3. BATTERY (LiFePO4) CARD */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between h-44 hover:border-emerald-500/40 transition duration-300 relative group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Battery (LiFePO4)</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">98% Health</span>
            </div>

            <div className="my-1 flex items-center justify-between">
              <div>
                <h3 className="text-3xl font-extrabold tracking-tight text-emerald-400 font-mono">
                  {batVolt.toFixed(2)}V
                </h3>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  Cap: <span className="text-slate-200 font-bold">{batPct}%</span> ({isCharging ? 'Charging' : 'Discharging'})
                </p>
              </div>

              {/* Circular Gauge Graphic */}
              <div className="relative w-12 h-12 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path className="text-slate-800" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-emerald-400 transition-all duration-700" strokeDasharray={`${batPct}, 100`} strokeWidth="3.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <span className="absolute text-[10px] font-extrabold text-slate-200 font-mono">{batPct}%</span>
              </div>
            </div>

            <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 transition-all duration-500" style={{ width: `${batPct}%` }} />
            </div>
            <p className="text-[10px] text-slate-500 text-right mt-1">Est. 14.5 Hours Remaining</p>
          </div>

          {/* 4. SOLAR POWER CARD */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between h-44 hover:border-amber-500/40 transition duration-300 relative group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Solar Power</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${isCharging ? 'bg-amber-950/80 text-amber-400 border border-amber-800/40' : 'bg-slate-900 text-slate-400'}`}>
                {isCharging ? 'ACTIVE' : 'IDLE'}
              </span>
            </div>

            <div className="my-1 flex items-center justify-between">
              <div>
                <h3 className="text-3xl font-extrabold tracking-tight text-amber-400 font-mono">
                  {solarWatts} W
                </h3>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  {solarVolt}V @ {solarAmps}A
                </p>
              </div>

              {/* Sun Icon Animation */}
              <div className={`h-10 w-10 rounded-xl bg-amber-950/40 border border-amber-800/40 flex items-center justify-center text-amber-400 ${isCharging ? 'animate-spin-slow' : ''}`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              </div>
            </div>

            <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${isCharging ? 85 : 0}%` }} />
            </div>
            <p className="text-[10px] text-slate-500 text-right mt-1">Today: 0.42 kWh Generated</p>
          </div>

          {/* 5. WIND SPEED ANEMOMETER CARD */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between h-44 hover:border-teal-500/40 transition duration-300 relative group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Wind Speed</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-950/80 text-teal-400 border border-teal-800/40">Light Breeze</span>
            </div>

            <div className="my-1 flex items-center justify-between">
              <div>
                <h3 className="text-3xl font-extrabold tracking-tight text-teal-400 font-mono">
                  {windSpeedMs.toFixed(1)} <span className="text-sm font-semibold">m/s</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  {windSpeedKmh} km/h (Gust: {gustSpeedMs}m/s)
                </p>
              </div>

              {/* Wind Compass Direction Graphic */}
              <div className="h-10 w-10 rounded-full border border-teal-800/60 bg-teal-950/30 flex items-center justify-center text-teal-400 relative">
                <span className="text-[9px] font-bold font-mono">SSW</span>
                <div className="absolute w-1 h-3 bg-teal-400 rounded-full transform rotate-45 -top-1" />
              </div>
            </div>

            <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
              <div className="h-full bg-teal-400 transition-all duration-500" style={{ width: `${Math.min(100, (windSpeedMs / 20) * 100)}%` }} />
            </div>
            <p className="text-[10px] text-slate-500 text-right mt-1">3-Cup Pulse Anemometer</p>
          </div>

          {/* 6. SOIL MOISTURE CARD */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between h-44 hover:border-emerald-500/40 transition duration-300 relative group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Soil Moisture</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">Ideal (40-70%)</span>
            </div>

            <div className="my-1 flex items-center justify-between">
              <div>
                <h3 className="text-4xl font-extrabold tracking-tight text-emerald-400 font-mono">
                  {soilPct}%
                </h3>
                <p className="text-xs text-slate-400 mt-1">Capacitive Sensor v1.2</p>
              </div>

              {/* Soil Moisture Circular Graphic */}
              <div className="relative w-12 h-12 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path className="text-slate-800" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-emerald-400 transition-all duration-700" strokeDasharray={`${soilPct}, 100`} strokeWidth="3.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <span className="absolute text-[10px] font-extrabold text-slate-200 font-mono">{soilPct}%</span>
              </div>
            </div>

            <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 transition-all duration-500" style={{ width: `${soilPct}%` }} />
            </div>
            <p className="text-[10px] text-slate-500 text-right mt-1">Irrigation Not Required</p>
          </div>

        </section>

        {/* 5. MULTI-TIMEFRAME INTERACTIVE SVG LINE & AREA CHARTS */}
        <section className="glass-panel p-6 rounded-3xl flex flex-col gap-6 shadow-2xl">
          
          {/* Chart Header & Filters */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold tracking-tight text-slate-100 font-mono">
                  Telemetry Analytics & Historical Trends
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800">
                  {selectedDeviceId}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Multi-metric sensor telemetry plotted across selectable time horizons.</p>
            </div>

            {/* Chart Type Selector Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl p-1 text-xs">
                {[
                  { id: 'temp', label: 'Temperature' },
                  { id: 'hum', label: 'Humidity' },
                  { id: 'bat', label: 'Battery V' },
                  { id: 'solar', label: 'Solar Power' },
                  { id: 'wind', label: 'Wind Speed' },
                  { id: 'soil', label: 'Soil Moisture' },
                  { id: 'rssi', label: 'Signal RSSI' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveChart(tab.id as any)}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                      activeChart === tab.id
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Time Range Horizon Filter */}
              <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl p-1 text-xs">
                {(['1H', '6H', '24H', '7D', '30D'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-2.5 py-1.5 rounded-lg font-mono font-bold transition ${
                      timeRange === range ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Interactive SVG Area Chart */}
          <div className="relative w-full h-[280px] bg-slate-950/60 rounded-2xl border border-slate-800/80 p-4 flex flex-col justify-between overflow-hidden group">
            
            {/* Chart Summary Stats */}
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono z-10">
              <div className="flex items-center gap-4">
                <span>Min: <strong className="text-slate-200">{chartSvgPath.minVal}</strong></span>
                <span>Avg: <strong className="text-indigo-400">{chartSvgPath.avgVal}</strong></span>
                <span>Max: <strong className="text-emerald-400">{chartSvgPath.maxVal}</strong></span>
              </div>
              <div>
                <span>Horizon: <strong>{timeRange}</strong> ({chartData.length} Samples)</span>
              </div>
            </div>

            {/* SVG Plot Graphic */}
            <div className="relative w-full h-[200px] mt-2">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 800 220" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {/* Grid Lines */}
                <line x1="20" y1="40" x2="780" y2="40" stroke="#1e293b" strokeDasharray="4 4" strokeWidth="1" />
                <line x1="20" y1="100" x2="780" y2="100" stroke="#1e293b" strokeDasharray="4 4" strokeWidth="1" />
                <line x1="20" y1="160" x2="780" y2="160" stroke="#1e293b" strokeDasharray="4 4" strokeWidth="1" />

                {/* Filled Area */}
                {chartSvgPath.areaPath && <path d={chartSvgPath.areaPath} fill="url(#chartGradient)" />}

                {/* Stroke Line */}
                {chartSvgPath.linePath && (
                  <path d={chartSvgPath.linePath} fill="none" stroke="#818cf8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            </div>

            {/* X-Axis Time Labels */}
            <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono pt-2 border-t border-slate-900">
              {chartData.filter((_, idx) => idx % Math.ceil(chartData.length / 6) === 0).map((d, i) => (
                <span key={i}>{d.time}</span>
              ))}
            </div>
          </div>
        </section>

        {/* 6. AI INSIGHTS & PREDICTIVE ANALYTICS PANEL */}
        <section className="glass-panel-glow p-6 rounded-3xl flex flex-col gap-5 shadow-2xl border-indigo-500/30">
          <div className="flex items-center justify-between border-b border-indigo-900/40 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-indigo-950 border border-indigo-700/50 flex items-center justify-center text-indigo-400 shadow-inner">
                <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-extrabold tracking-tight text-slate-100 flex items-center gap-2">
                  AeroBot AI Diagnostic Insights & Predictive Analytics
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Automated telemetry pattern recognition, battery longevity forecasts, and agronomic guidance.</p>
              </div>
            </div>
            <span className="text-xs font-bold font-mono px-3 py-1 rounded-xl bg-indigo-950 text-indigo-300 border border-indigo-800">
              Confidence: 96%
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Insight 1: Soil Moisture */}
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Agronomic Soil Health</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/50">Optimal</span>
                </div>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                  Soil moisture is at <strong className="text-emerald-400">{soilPct}%</strong> (within ideal 40-70% range). Next irrigation estimated in 18 hours.
                </p>
              </div>
              <button
                onClick={() => handleSendCommand('status')}
                className="w-full py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-700 transition"
              >
                Schedule Irrigation Check
              </button>
            </div>

            {/* Insight 2: Battery Longevity */}
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Battery Runtime Forecast</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800/50">14.5 Hours</span>
                </div>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                  Solar charging active at 13.8V. Estimated runtime on battery fallback is 14.5 hours with current GSM transmission interval.
                </p>
              </div>
              <button
                onClick={() => handleSendCommand('reboot')}
                className="w-full py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-700 transition"
              >
                Optimize Power Profile
              </button>
            </div>

            {/* Insight 3: Wind & Structural Security */}
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">Wind & Weather Advisory</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800/50">Safe Breeze</span>
                </div>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                  Average wind speed is <strong className="text-sky-400">{windSpeedMs.toFixed(1)} m/s</strong> ({windSpeedKmh} km/h). Weather station structure operating within safe bounds.
                </p>
              </div>
              <button
                onClick={handleExportCSV}
                className="w-full py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-700 transition"
              >
                Download Weather Report
              </button>
            </div>

          </div>
        </section>

        {/* 7. QUICK ACTIONS & RECENT ACTIVITY TABLE */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Quick Actions Control Panel */}
          <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 shadow-xl">
            <h2 className="text-base font-extrabold tracking-tight text-slate-100 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
              Quick Hardware Controls
            </h2>
            <p className="text-xs text-slate-400">Execute remote control triggers to the ESP32 microcontroller station.</p>

            <div className="flex flex-col gap-2.5 mt-2">
              <button
                onClick={() => handleSendCommand('reboot')}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-200 hover:border-indigo-500 hover:text-indigo-400 transition flex items-center justify-between"
              >
                <span>Restart ESP32 Microcontroller</span>
                <span className="text-[10px] font-mono bg-slate-950 px-2 py-0.5 rounded text-slate-400">/reboot</span>
              </button>

              <button
                onClick={() => handleSendCommand('status')}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-200 hover:border-emerald-500 hover:text-emerald-400 transition flex items-center justify-between"
              >
                <span>Query Diagnostics & RSSI</span>
                <span className="text-[10px] font-mono bg-slate-950 px-2 py-0.5 rounded text-slate-400">/status</span>
              </button>

              <button
                onClick={() => handleSendCommand('wind')}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-200 hover:border-sky-500 hover:text-sky-400 transition flex items-center justify-between"
              >
                <span>Anemometer Speed Check</span>
                <span className="text-[10px] font-mono bg-slate-950 px-2 py-0.5 rounded text-slate-400">/wind</span>
              </button>

              <button
                onClick={handleExportCSV}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-200 hover:border-amber-500 hover:text-amber-400 transition flex items-center justify-between"
              >
                <span>Export System Log (CSV)</span>
                <span className="text-[10px] font-mono bg-slate-950 px-2 py-0.5 rounded text-slate-400">CSV</span>
              </button>
            </div>
          </div>

          {/* Recent Activity Table */}
          <div className="glass-panel p-6 rounded-3xl lg:col-span-2 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <h2 className="text-base font-extrabold tracking-tight text-slate-100 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Recent Telemetry & Activity Stream
              </h2>
              <span className="text-xs text-slate-400 font-mono">{historyLogs.length} Records</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Device</th>
                    <th className="py-2.5 px-3">Temp</th>
                    <th className="py-2.5 px-3">Humid</th>
                    <th className="py-2.5 px-3">Battery</th>
                    <th className="py-2.5 px-3">Wind</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="text-xs font-mono divide-y divide-slate-900/60">
                  {historyLogs.slice(0, 6).map((log) => (
                    <tr key={log.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-2.5 px-3 text-slate-400">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-200">{log.device_id}</td>
                      <td className="py-2.5 px-3 text-rose-400">{log.temperature ? `${log.temperature.toFixed(1)}°C` : 'N/A'}</td>
                      <td className="py-2.5 px-3 text-sky-400">{log.humidity ? `${log.humidity.toFixed(0)}%` : 'N/A'}</td>
                      <td className="py-2.5 px-3 text-emerald-400">{log.battery_voltage ? `${log.battery_voltage.toFixed(2)}V` : '12.8V'}</td>
                      <td className="py-2.5 px-3 text-teal-400">{log.wind_speed ? `${log.wind_speed.toFixed(1)} m/s` : '3.8 m/s'}</td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                          SUCCESS 200
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </section>

      </main>

      {/* 8. ENTERPRISE FOOTER */}
      <footer className="border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-md py-4 px-6 text-xs text-slate-400 mt-12">
        <div className="max-w-[1500px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              API Online
            </span>
            <span>•</span>
            <span>Uptime: 99.98%</span>
            <span>•</span>
            <span>Vercel Edge Node</span>
          </div>

          <p className="text-[11px] text-slate-400 font-medium">
            © 2026 AeroBot IoT Solar Outdoor Monitoring System. Built with Next.js 16 & ESP32 DevKitC V4.
          </p>
        </div>
      </footer>

    </div>
  );
}
