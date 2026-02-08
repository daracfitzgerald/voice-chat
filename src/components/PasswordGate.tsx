import { useState, useCallback } from 'react';

const PASS_HASH = 'b6b9fbdcb79928b3808cc932fbbee0a4abe8ceb0470fa53e69e9aef2c3a31890';

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(() => {
    return sessionStorage.getItem('vc-auth') === 'true';
  });
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const hash = await sha256(password);
    if (hash === PASS_HASH) {
      sessionStorage.setItem('vc-auth', 'true');
      setAuthenticated(true);
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  }, [password]);

  if (authenticated) return <>{children}</>;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#0d0d18', color: '#e0e0e0',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <form onSubmit={handleSubmit} style={{ textAlign: 'center' }}>
        <h2 style={{ marginBottom: 20 }}>🎙️ Voice Chat</h2>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          style={{
            padding: '10px 16px', fontSize: 16, borderRadius: 8,
            border: error ? '2px solid #ef4444' : '1px solid #333',
            background: '#1a1a2e', color: '#e0e0e0', marginRight: 8
          }}
        />
        <button type="submit" style={{
          padding: '10px 20px', fontSize: 16, borderRadius: 8,
          background: '#6366f1', color: 'white', border: 'none', cursor: 'pointer'
        }}>Enter</button>
        {error && <p style={{ color: '#ef4444', marginTop: 10 }}>Wrong password</p>}
      </form>
    </div>
  );
}
