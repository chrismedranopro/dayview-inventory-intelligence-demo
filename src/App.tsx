import { useState } from 'react';
import { BrowserRouter, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { resetDemo } from './data/db';
import { DEMO_LABEL } from './domain/seed';
import { btnSecondary } from './components/ui';
import Dashboard from './pages/Dashboard';
import InvoiceReview from './pages/InvoiceReview';
import Invoices from './pages/Invoices';
import NewInvoice from './pages/NewInvoice';

const link = ({ isActive }: { isActive: boolean }) =>
  `block rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`;

function Layout() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    if (!window.confirm('Reset the demo? All invoices, movements and edits return to the original seed data.')) return;
    setBusy(true); await resetDemo(); setBusy(false); nav('/');
  };
  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-slate-900 p-4 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0">
        <p className="text-sm font-semibold leading-tight text-white">Dayview Inventory Intelligence<span className="block text-xs font-normal text-slate-400">Concept Demo</span></p>
        <nav aria-label="Main" className="mt-3 flex gap-1 md:mt-6 md:block md:space-y-1">
          <NavLink to="/" end className={link}>Dashboard</NavLink>
          <NavLink to="/invoices" className={link}>Invoices</NavLink>
        </nav>
        <button onClick={reset} disabled={busy} className={`${btnSecondary} mt-3 w-full md:mt-8`}>{busy ? 'Resetting…' : 'Reset demo'}</button>
        <p className="mt-3 hidden text-xs text-slate-400 md:block">IKA EPOS: Demo adapter / not connected. Data is stored only in this browser.</p>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">{DEMO_LABEL} Speculative prototype: not a deployed Dayview system.</div>
        <div className="mx-auto max-w-6xl p-4 md:p-6"><Outlet /></div>
      </main>
    </div>
  );
}

export default function App() { return <BrowserRouter><AppRoutes /></BrowserRouter>; }

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/new" element={<NewInvoice />} />
        <Route path="invoices/:id" element={<InvoiceReview />} />
        <Route path="*" element={<p className="text-sm">Page not found.</p>} />
      </Route>
    </Routes>
  );
}
