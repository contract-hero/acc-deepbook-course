import { useState } from 'react';
import { setupSandboxBrowser } from './sandbox.js';
import { swapQuoteForBase } from './swap.js';

export function App() {
  const [status, setStatus] = useState<'idle' | 'running'>('idle');
  const [result, setResult] = useState<{ digest: string; baseOut: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSwap() {
    setStatus('running');
    setResult(null);
    setError(null);
    try {
      const ctx = await setupSandboxBrowser();
      const res = await swapQuoteForBase(ctx, { poolKey: 'DEEP_SUI', amount: 0.1, minOut: 0 });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatus('idle');
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 520, margin: '3rem auto' }}>
      <h1>01-swap — Pattern A</h1>
      <p>Swap over the CLOB without a BalanceManager.</p>
      <button onClick={runSwap} disabled={status === 'running'}>
        {status === 'running' ? 'Swapping…' : 'Swap 0.1 SUI → DEEP'}
      </button>
      {result && (
        <pre style={{ background: '#f3f3f3', padding: '1rem', marginTop: '1rem' }}>
          digest: {result.digest}
          {'\n'}baseOut (DEEP): {result.baseOut}
        </pre>
      )}
      {error && <pre style={{ color: '#b00', marginTop: '1rem' }}>Error: {error}</pre>}
    </main>
  );
}
