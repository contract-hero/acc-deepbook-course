import { useState } from 'react';
import { setupWithBalanceManagerBrowser } from './sandbox.js';
import { placeRestingBid, listOpenOrders, cancelAll, placeMarketBuy } from './orders.js';
import type { SandboxConfigWithBM } from './sandbox.js';

type Status = 'idle' | 'busy';

export function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [ctx, setCtx] = useState<SandboxConfigWithBM | null>(null);
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

  async function handlePlaceBid() {
    if (!ctx) { setError('Run setup first'); return; }
    await run('Placing resting bid', async () => {
      const digest = await placeRestingBid(ctx, { poolKey: 'DEEP_SUI', depositSui: 1, quantity: 10, clientOrderId: String(Date.now()) });
      log(`Bid placed — digest: ${digest}`);
    });
  }

  async function handleListOrders() {
    if (!ctx) { setError('Run setup first'); return; }
    await run('Listing open orders', async () => {
      const orders = await listOpenOrders(ctx, 'DEEP_SUI');
      log(`Open orders (${orders.length}): ${orders.join(', ') || '(none)'}`);
    });
  }

  async function handleCancelAll() {
    if (!ctx) { setError('Run setup first'); return; }
    await run('Cancelling all orders', async () => {
      const digest = await cancelAll(ctx, 'DEEP_SUI');
      log(`All orders cancelled — digest: ${digest}`);
    });
  }

  async function handleMarketBuy() {
    if (!ctx) { setError('Run setup first'); return; }
    await run('Placing market buy', async () => {
      const digest = await placeMarketBuy(ctx, { poolKey: 'DEEP_SUI', depositSui: 5, quantity: 1, clientOrderId: String(Date.now()) });
      log(`Market buy — digest: ${digest}`);
    });
  }

  const busy = status === 'busy';
  const btnStyle: React.CSSProperties = { margin: '0.25rem', padding: '0.5rem 1rem', cursor: busy ? 'not-allowed' : 'pointer' };

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 600, margin: '3rem auto' }}>
      <h1>02-orders — Pattern B</h1>
      <p>BalanceManager lifecycle: deposit → limit/market order → cancel.</p>
      <div>
        <button style={btnStyle} onClick={handleSetup} disabled={busy}>Setup BalanceManager</button>
        <button style={btnStyle} onClick={handlePlaceBid} disabled={busy || !ctx}>Place resting bid</button>
        <button style={btnStyle} onClick={handleListOrders} disabled={busy || !ctx}>List open orders</button>
        <button style={btnStyle} onClick={handleCancelAll} disabled={busy || !ctx}>Cancel all</button>
        <button style={btnStyle} onClick={handleMarketBuy} disabled={busy || !ctx}>Place market buy</button>
      </div>
      {lines.length > 0 && (
        <pre style={{ background: '#f3f3f3', padding: '1rem', marginTop: '1rem', whiteSpace: 'pre-wrap' }}>
          {lines.join('\n')}
        </pre>
      )}
      {error && <pre style={{ color: '#b00', marginTop: '1rem' }}>Error: {error}</pre>}
    </main>
  );
}
