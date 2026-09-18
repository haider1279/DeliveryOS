import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Sparkles, ArrowRight, Shield, UserCheck, Code, Bug, Building } from 'lucide-react';
import { UserRole } from '@deliveryos/shared';

export const Login: React.FC = () => {
  const { login, devLoginAs } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      // Auth context will populate user, navigate based on role:
      navigate('/app/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (personaEmail: string, isClient: boolean) => {
    setError(null);
    setLoading(true);
    try {
      await devLoginAs(personaEmail);
      if (isClient) {
        navigate('/portal/projects');
      } else {
        navigate('/app/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Quick login failed');
    } finally {
      setLoading(false);
    }
  };

  const personas = [
    {
      role: 'Super Admin',
      email: 'superadmin@deliveryos.local',
      icon: Shield,
      desc: 'Elena Vance — Full system control & audit',
      isClient: false,
    },
    {
      role: 'Project Manager',
      email: 'pm@deliveryos.local',
      icon: UserCheck,
      desc: 'Sarah Connor — Requirements, estimates & releases',
      isClient: false,
    },
    {
      role: 'Developer',
      email: 'dev@deliveryos.local',
      icon: Code,
      desc: 'David Kim — Tasks, code & time tracking',
      isClient: false,
    },
    {
      role: 'QA Engineer',
      email: 'qa@deliveryos.local',
      icon: Bug,
      desc: 'Priya Patel — Test runs & bug triage',
      isClient: false,
    },
    {
      role: 'Client (Acme Corp)',
      email: 'client@acmecorp.local',
      icon: Building,
      desc: 'Alexander Pierce — Approvals, reviews & invoices',
      isClient: true,
    },
    {
      role: 'Client (Starlight Retail)',
      email: 'client@starlightretail.local',
      icon: Building,
      desc: 'Chloe Zhao — Cross-tenant isolation demo',
      isClient: true,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-950 to-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-white">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-lg shadow-brand-500/30 mb-4">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight">DeliveryOS</h2>
        <p className="mt-2 text-sm text-slate-400">
          Software House Operating Platform & Client Portal
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-white/10 backdrop-blur-xl py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-white/10">
          {error && (
            <div className="mb-4 rounded-lg bg-rose-500/20 border border-rose-500/40 p-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-medium text-slate-200">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@agency.com"
                className="mt-1 block w-full rounded-lg bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-200">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 block w-full rounded-lg bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-600 py-2.5 px-4 text-sm font-semibold text-white shadow-md hover:bg-brand-500 focus:outline-none transition-all disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Quick Demo Personas */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 text-center mb-3">
              One-Click Role Switcher (Demo Mode)
            </span>
            <div className="grid grid-cols-1 gap-2">
              {personas.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.email}
                    onClick={() => handleQuickLogin(p.email, p.isClient)}
                    disabled={loading}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 text-left transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-md bg-white/10 text-brand-300 group-hover:text-white">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="block text-xs font-semibold text-slate-100">
                          {p.role}
                        </span>
                        <span className="block text-[10px] text-slate-400">{p.desc}</span>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 group-hover:text-brand-300 font-mono text-[10px]">
                      {p.email}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
