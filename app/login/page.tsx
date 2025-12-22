'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = useMemo(() => {
    return email.trim().length > 3 && password.length >= 6 && !loading
  }, [email, password, loading])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    router.replace('/dashboard')
  }

  return (
    <main className="login-page">
      {/* background glows */}
      <div className="bg-glow bg-glow-a" />
      <div className="bg-glow bg-glow-b" />

      <section className="card-wrap">
        <div className="card">
          {/* subtle watermark behind card */}
          <div className="wm" aria-hidden />

          <header className="head">
            <div className="logo">T5</div>
            <div className="head-text">
              <div className="pill">Triple 555 CRM</div>
              <div className="title">Welcome back</div>
              <div className="sub">Sign in to access your dashboard</div>
            </div>
          </header>

          <form onSubmit={onSubmit} className="form">
            <label className="field">
              <span className="label">Email</span>
              <input
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.co.uk"
                autoComplete="email"
                inputMode="email"
                required
              />
            </label>

            <label className="field">
              <span className="label">Password</span>
              <input
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>

            {error && <div className="error">{error}</div>}

            <button className="btn" type="submit" disabled={!canSubmit}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <div className="foot">Secure internal access · Triple 555</div>
          </form>
        </div>
      </section>

      <style jsx>{`
        .login-page {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 42px 18px;
          position: relative;
          overflow: hidden;
          color: #fff;
          background: radial-gradient(1200px 600px at 50% -120px, rgba(0, 255, 255, 0.25), rgba(0, 0, 0, 0) 60%),
            radial-gradient(900px 500px at 82% 20%, rgba(0, 180, 255, 0.18), rgba(0, 0, 0, 0) 62%),
            linear-gradient(180deg, #050b1c, #030615 70%, #020410);
          font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }

        .bg-glow {
          position: absolute;
          inset: -200px;
          pointer-events: none;
          opacity: 0.9;
          filter: blur(0px);
        }
        .bg-glow-a {
          background: radial-gradient(520px 320px at 45% 12%, rgba(0, 255, 255, 0.22), rgba(0, 0, 0, 0) 70%);
        }
        .bg-glow-b {
          background: radial-gradient(520px 320px at 70% 28%, rgba(0, 140, 255, 0.14), rgba(0, 0, 0, 0) 72%);
        }

        .card-wrap {
          width: 100%;
          display: grid;
          place-items: center;
          position: relative;
          z-index: 1;
        }

        .card {
          width: 100%;
          max-width: 460px;
          border-radius: 18px;
          padding: 18px;
          position: relative;
          overflow: hidden;

          border: 1px solid rgba(0, 255, 255, 0.22);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
          box-shadow: 0 0 0 1px rgba(0, 255, 255, 0.08), 0 18px 60px rgba(0, 0, 0, 0.6);
        }

        /* cyan edge glow like your leads panels */
        .card:before {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: 20px;
          pointer-events: none;
          background: radial-gradient(600px 180px at 50% 0%, rgba(0, 255, 255, 0.22), rgba(0, 0, 0, 0) 60%),
            radial-gradient(700px 220px at 0% 60%, rgba(0, 255, 255, 0.14), rgba(0, 0, 0, 0) 70%),
            radial-gradient(700px 220px at 100% 60%, rgba(0, 180, 255, 0.12), rgba(0, 0, 0, 0) 70%);
          opacity: 0.9;
          mix-blend-mode: screen;
        }

        /* subtle Triple555 watermark behind content */
        .wm {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.16;
          background-image: radial-gradient(circle at 20% 30%, rgba(0, 255, 255, 0.25), rgba(0, 0, 0, 0) 45%),
            radial-gradient(circle at 80% 60%, rgba(0, 180, 255, 0.18), rgba(0, 0, 0, 0) 45%);
        }
        .wm:after {
          content: 'TRIPLE555 · TRIPLE555 · TRIPLE555 · TRIPLE555 · TRIPLE555 · TRIPLE555';
          position: absolute;
          left: -120px;
          top: 40px;
          width: 900px;
          transform: rotate(-12deg);
          font-weight: 950;
          letter-spacing: 6px;
          font-size: 34px;
          color: rgba(0, 255, 255, 0.22);
          filter: blur(0.2px);
          white-space: nowrap;
          mask-image: linear-gradient(90deg, transparent, rgba(0, 0, 0, 1), transparent);
          opacity: 0.35;
        }

        .head {
          display: flex;
          gap: 14px;
          align-items: center;
          position: relative;
          z-index: 2;
          margin-bottom: 14px;
        }

        .logo {
          width: 46px;
          height: 46px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          font-weight: 950;

          background: rgba(0, 255, 255, 0.14);
          border: 1px solid rgba(0, 255, 255, 0.35);
          box-shadow: 0 0 0 1px rgba(0, 255, 255, 0.12), 0 14px 40px rgba(0, 0, 0, 0.6);
        }

        .pill {
          display: inline-flex;
          width: fit-content;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0, 255, 255, 0.18);
          background: rgba(0, 255, 255, 0.07);
          font-weight: 900;
          font-size: 12px;
          letter-spacing: 0.4px;
        }

        .title {
          margin-top: 10px;
          font-size: 26px;
          font-weight: 950;
          line-height: 1.05;
        }

        .sub {
          margin-top: 6px;
          font-size: 13px;
          font-weight: 800;
          opacity: 0.82;
        }

        .form {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 12px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .label {
          font-weight: 900;
          font-size: 12px;
          letter-spacing: 0.4px;
          opacity: 0.9;
          color: rgba(210, 255, 255, 0.95);
        }

        .input {
          width: 100%;
          padding: 12px 12px;
          border-radius: 12px;
          border: 1px solid rgba(0, 255, 255, 0.16);
          background: rgba(0, 0, 0, 0.26);
          color: #fff;
          font-weight: 850;
          outline: none;
        }
        .input:focus {
          border-color: rgba(0, 255, 255, 0.32);
          box-shadow: 0 0 0 1px rgba(0, 255, 255, 0.14), 0 0 0 4px rgba(0, 255, 255, 0.08);
        }

        .error {
          margin-top: 4px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255, 80, 80, 0.35);
          background: rgba(255, 80, 80, 0.08);
          color: rgba(255, 190, 190, 0.95);
          font-weight: 850;
          font-size: 13px;
        }

        .btn {
          margin-top: 6px;
          width: 100%;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(0, 255, 255, 0.34);
          background: rgba(0, 255, 255, 0.18);
          color: #fff;
          font-weight: 950;
          cursor: pointer;
          box-shadow: 0 0 0 1px rgba(0, 255, 255, 0.08), 0 16px 40px rgba(0, 0, 0, 0.45);
        }
        .btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .foot {
          margin-top: 6px;
          text-align: center;
          font-weight: 850;
          opacity: 0.7;
          font-size: 12px;
        }
      `}</style>
    </main>
  )
}
