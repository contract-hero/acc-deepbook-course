import { useState } from 'react';
import { setupWithBalanceManagerBrowser } from './sandbox.js';
import { quoteTwoSidedGrid, stakeDeep, listOpenOrders, cancelAll } from './marketMaker.js';
import type { SandboxConfigWithBM } from './sandbox.js';

type Status = 'idle' | 'busy';

export function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [ctx, setCtx] = useState<SandboxConfigWithBM | null>(null);
  const [openOrderCount, setOpenOrderCount] = useState<number | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function log(msg: string) { setLines((l) => [...l, msg]); }

  async function run(label: string, fn: () => Promise<void>) {
    setStatus('busy');
    setError(null);
    try {
      log(`→ ${label}…`);
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatus('idle');
    }
  }

  async function handleSetup() {
    await run('Setting up BalanceManager', async () => {
      const c = await setupWithBalanceManagerBrowser();
      setCtx(c);
      log(`BalanceManager: ${c.balanceManagerId}`);
    });
  }

  async function handleStartQuoting() {
    if (!ctx) { setError('Run setup first'); return; }
    await run('Placing two-sided grid', async () => {
      const digest = await quoteTwoSidedGrid(ctx, {
        poolKey: 'DEEP_SUI', levels: 2, spreadBps: 500,
        sizePerLevel: 10, depositSui: 20, depositDeep: 200,
      });
      log(`Grid placed — digest: ${digest}`);
      const orders = await listOpenOrders(ctx, 'DEEP_SUI');
      setOpenOrderCount(orders.length);
      log(`Open orders: ${orders.length}`);
    });
  }

  async function handleStakeDeep() {
    if (!ctx) { setError('Run setup first'); return; }
    await run('Staking DEEP for fee rebates', async () => {
      const digest = await stakeDeep(ctx, { poolKey: 'DEEP_SUI', amount: 10, depositDeep: 50 });
      log(`DEEP staked — digest: ${digest}`);
    });
  }

  async function handleCancelAll() {
    if (!ctx) { setError('Run setup first'); return; }
    await run('Cancelling all orders', async () => {
      const digest = await cancelAll(ctx, 'DEEP_SUI');
      log(`All orders cancelled — digest: ${digest}`);
      setOpenOrderCount(0); // optimistic: cancelAllOrders is atomic
    });
  }

  const busy = status === 'busy';
  const btnStyle: React.CSSProperties = {
    margin: '0.25rem', padding: '0.5rem 1rem', cursor: busy ? 'not-allowed' : 'pointer',
  };

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 640, margin: '3rem auto' }}>
      <h1>04-market-maker — Pattern F</h1>
      <p>Two-sided quoting grid + DEEP staking for maker fee rebates.</p>
      <div>
        <button style={btnStyle} onClick={handleSetup} disabled={busy}>Setup BalanceManager</button>
        <button style={btnStyle} onClick={handleStartQuoting} disabled={busy || !ctx}>Start quoting</button>
        <button style={btnStyle} onClick={handleStakeDeep} disabled={busy || !ctx}>Stake DEEP</button>
        <button style={btnStyle} onClick={handleCancelAll} disabled={busy || !ctx}>Cancel all</button>
      </div>
      {openOrderCount !== null && (
        <p style={{ fontWeight: 'bold' }}>Open orders: {openOrderCount}</p>
      )}
      {lines.length > 0 && (
        <pre style={{ background: '#f3f3f3', padding: '1rem', marginTop: '1rem', whiteSpace: 'pre-wrap' }}>
          {lines.join('\n')}
        </pre>
      )}
      {error && <pre style={{ color: '#b00', marginTop: '1rem' }}>Error: {error}</pre>}
    </main>
  );
}
