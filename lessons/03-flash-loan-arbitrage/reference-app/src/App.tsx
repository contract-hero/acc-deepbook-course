import { useState } from 'react';
import { setupSandboxBrowser } from './sandbox.js';
import { runFlashLoanArb } from './flashLoan.js';
import deployment from '../deployment.json';

const ARB_EXECUTOR_PACKAGE_ID = (deployment as { arbExecutorPackageId: string }).arbExecutorPackageId;

export function App() {
  const [status, setStatus] = useState<'idle' | 'running'>('idle');
  const [digest, setDigest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runArb() {
    setStatus('running');
    setDigest(null);
    setError(null);
    try {
      const ctx = await setupSandboxBrowser();
      const d = await runFlashLoanArb(ctx, {
        poolKey: 'DEEP_SUI',
        borrow: 1,
        arbExecutorPackageId: ARB_EXECUTOR_PACKAGE_ID,
      });
      setDigest(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatus('idle');
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 560, margin: '3rem auto' }}>
      <h1>03-flash-loan — Pattern E</h1>
      <p>
        Atomic flash loan over the DeepBook hot-potato: borrow 1 DEEP, run the arb step in the
        <code> arb_executor</code> Move module, repay the exact principal — all in one PTB. Short
        repayment reverts the entire transaction.
      </p>
      <button onClick={runArb} disabled={status === 'running'}>
        {status === 'running' ? 'Running…' : 'Run flash-loan arb'}
      </button>
      {digest && (
        <pre style={{ background: '#f3f3f3', padding: '1rem', marginTop: '1rem' }}>
          digest: {digest}
        </pre>
      )}
      {error && <pre style={{ color: '#b00', marginTop: '1rem' }}>Revert / error: {error}</pre>}
    </main>
  );
}
