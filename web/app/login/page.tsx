// /web/app/login/page.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        // Redirect to protected dashboard root
        router.push('/');
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || 'Incorrect password.');
      }
    } catch (err) {
      setError('Connection failure. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070B13] text-slate-100 flex items-center justify-center font-sans p-6 select-none relative">
      {/* Background glowing blobs */}
      <div className="absolute top-1/4 left-1/3 w-[400px] h-[400px] bg-indigo-900/10 rounded-full blur-[100px] pointer-events-none -z-10" />
      <div className="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] bg-emerald-900/5 rounded-full blur-[100px] pointer-events-none -z-10" />

      <div className="w-full max-w-md border border-slate-800/80 bg-slate-900/30 backdrop-blur-xl p-8 rounded-3xl flex flex-col shadow-2xl transition duration-300 hover:border-slate-700/80">
        
        {/* Logo and Headings */}
        <div className="flex flex-col items-center gap-3 text-center mb-8">
          <div className="h-14 w-14 rounded-2xl overflow-hidden shadow-lg shadow-indigo-500/25 border border-indigo-500/30">
            <img src="/logo.png" alt="AeroBot Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              Access Restricted
            </h1>
            <p className="text-xs text-slate-500 font-semibold tracking-wider uppercase mt-1">AeroBot Security Gateway</p>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Enter Administrative Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition placeholder:text-slate-700"
              required
              disabled={loading}
              autoFocus
            />
          </div>

          {error && (
            <div className="p-3 text-xs font-semibold text-red-400 bg-red-950/20 border border-red-800/40 rounded-xl flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none transition duration-200 rounded-xl text-sm font-bold text-white shadow-lg shadow-indigo-950/30 flex items-center justify-center gap-2"
          >
            {loading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            ) : null}
            {loading ? 'Authenticating...' : 'Unlock Dashboard'}
          </button>
        </form>

        {/* Footer */}
        <p className="text-[10px] text-slate-600 text-center mt-8">
          Session expires automatically after 7 days.<br />
          Contact system administrator for password recovery.
        </p>

      </div>
    </div>
  );
}
