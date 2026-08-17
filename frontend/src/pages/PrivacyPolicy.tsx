import { Link } from '@tanstack/react-router'
import { sourceUrl } from '../utils/site'

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-2">
          <p className="text-[11px] tracking-widest uppercase text-muted">Draft — pending legal review</p>
          <h1 className="text-3xl font-semibold text-primary" style={{ fontFamily: 'var(--serif)' }}>Privacy Policy</h1>
          <p className="text-xs text-muted tracking-wide">Last updated 2026-04-26</p>
        </header>

        <section className="space-y-3 text-sm text-secondary leading-relaxed">
          <p>
            sub-12 is developed and operated by <a href="https://eyup.io" target="_blank" rel="noopener noreferrer" className="text-[var(--brass)] hover:underline">EyUp.io</a>,
            who are the data controller for the information described below.
          </p>
          <p>
            This Privacy Policy describes how sub-12 ("we", "us") handles personal information when you use our target-shooting
            companion app and related services (the "Service"). By using the Service, you agree to the practices described here.
          </p>
          <p>
            sub-12 is open source under the{' '}
            <a href="https://github.com/eyupio/sub12/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="text-[var(--brass)] hover:underline">AGPL-3.0</a> licence,
            and the code that handles your data is{' '}
            <a href={sourceUrl()} target="_blank" rel="noopener noreferrer" className="text-[var(--brass)] hover:underline">public and auditable</a>.
            This policy covers the instance operated by EyUp.io at sub12.io. Anyone
            self-hosting their own copy is a separate controller, responsible for
            their own deployment and their own policy.
          </p>
        </section>

        <Section title="Information we collect">
          <ul className="list-disc pl-5 space-y-2">
            <li><span className="font-medium text-primary">Account data:</span> email address, display name, and a hashed password.</li>
            <li><span className="font-medium text-primary">Activity data:</span> score cards, pellet test results and measurements, rifle and pellet gear, locations, league and club memberships, and any social interactions (follows, comments).</li>
            <li><span className="font-medium text-primary">Uploaded content:</span> images of targets, gear, profile avatars, and pellet-test photos.</li>
            <li><span className="font-medium text-primary">Technical data:</span> IP address, device and browser metadata, and basic request logs.</li>
          </ul>
        </Section>

        <Section title="How we use your information">
          <ul className="list-disc pl-5 space-y-2">
            <li>To operate, maintain, and improve the Service.</li>
            <li>To authenticate your account and protect against abuse.</li>
            <li>To send transactional email (password resets, league invitations, important account notices).</li>
            <li>To compute statistics, leaderboards, and achievements you participate in.</li>
          </ul>
        </Section>

        <Section title="Sharing">
          <p>
            We do not sell your personal information. Content you publish (e.g., public score cards, league standings, public
            pellet-test leaderboard entries) is visible to other users by design. We may disclose information when required by law
            or to protect the rights, property, or safety of users or the public.
          </p>
        </Section>

        <Section title="Data retention">
          <p>
            We retain account data for as long as your account is active. You can delete your account at any time from the Privacy
            Center; deletion removes your personal data, though aggregated and anonymized statistics may be retained.
          </p>
        </Section>

        <Section title="Security">
          <p>
            We use industry-standard measures including hashed passwords, JWT-based authentication with short-lived access tokens,
            and HTTPS in production. No system is perfectly secure; please use a strong, unique password.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Depending on your jurisdiction, you may have rights to access, correct, export, or delete your personal data. Most of
            these are available directly in-app under Settings → Privacy. For other requests, contact us through the Support
            Center.
          </p>
        </Section>

        <Section title="Children">
          <p>The Service is not directed to children under 13, and we do not knowingly collect personal data from them.</p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this Privacy Policy from time to time. Material changes will be communicated through the Service. Your
            continued use of the Service after a change constitutes acceptance.
          </p>
        </Section>

        <footer className="pt-6 border-t border-subtle flex items-center justify-between text-xs">
          <Link to="/" className="text-muted hover:text-[var(--brass)] transition-colors">← Back to home</Link>
          <div className="flex items-center gap-3 text-muted">
            <Link to="/terms" className="hover:text-[var(--brass)] transition-colors">Terms</Link>
            <Link to="/cookies" className="hover:text-[var(--brass)] transition-colors">Cookies</Link>
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
