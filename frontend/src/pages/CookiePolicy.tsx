import { Link } from '@tanstack/react-router'

export default function CookiePolicy() {
  return (
    <div className="min-h-screen px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-2">
          <p className="text-[11px] tracking-widest uppercase text-muted">Draft — pending legal review</p>
          <h1 className="text-3xl font-semibold text-primary" style={{ fontFamily: 'var(--serif)' }}>Cookie Policy</h1>
          <p className="text-xs text-muted tracking-wide">Last updated 2026-04-26</p>
        </header>

        <section className="space-y-3 text-sm text-secondary leading-relaxed">
          <p>
            This Cookie Policy explains how sub-12 uses cookies and similar browser-storage technologies (collectively, "cookies"
            here) when you use our Service.
          </p>
        </section>

        <Section title="What we store">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <span className="font-medium text-primary">Refresh-token cookie (HTTP-only):</span> a secure cookie set by the API
              that lets us mint a fresh access token without forcing you to log in again. Strictly necessary for keeping you
              signed in.
            </li>
            <li>
              <span className="font-medium text-primary">localStorage — auth state:</span> your basic user profile and access
              token are persisted in localStorage so the app loads instantly on return. Required for app functionality.
            </li>
            <li>
              <span className="font-medium text-primary">localStorage — preferences:</span> your selected theme (light/dark) and
              other UI preferences are stored locally so the app remembers your choices.
            </li>
            <li>
              <span className="font-medium text-primary">sessionStorage:</span> short-lived values such as a two-factor
              authentication challenge token, scoped to a single browser tab.
            </li>
          </ul>
        </Section>

        <Section title="What we don't use">
          <p>
            We do not use third-party advertising cookies, cross-site tracking pixels, or analytics that profile you across other
            sites. The Service ships without third-party trackers.
          </p>
        </Section>

        <Section title="Managing cookies and storage">
          <p>
            You can clear cookies and local storage through your browser's settings at any time. Doing so will sign you out and
            reset preferences. Blocking the strictly necessary refresh-token cookie will prevent you from staying signed in.
          </p>
        </Section>

        <Section title="Mobile apps">
          <p>
            When the Service runs as a Capacitor-packaged mobile app, equivalent local storage is provided by the OS-level webview
            on your device. The same categories above apply.
          </p>
        </Section>

        <Section title="Changes">
          <p>We may update this Cookie Policy as the Service evolves. Material changes will be communicated through the Service.</p>
        </Section>

        <footer className="pt-6 border-t border-subtle flex items-center justify-between text-xs">
          <Link to="/" className="text-muted hover:text-[var(--brass)] transition-colors">← Back to home</Link>
          <div className="flex items-center gap-3 text-muted">
            <Link to="/privacy" className="hover:text-[var(--brass)] transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-[var(--brass)] transition-colors">Terms</Link>
          </div>
        </footer>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-primary tracking-wide">{title}</h2>
      <div className="text-sm text-secondary leading-relaxed">{children}</div>
    </section>
  )
}
