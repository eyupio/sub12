import { Link } from '@tanstack/react-router'

export default function TermsOfUse() {
  return (
    <div className="min-h-screen px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-2">
          <p className="text-[11px] tracking-widest uppercase text-muted">Draft — pending legal review</p>
          <h1 className="text-3xl font-semibold text-primary" style={{ fontFamily: 'var(--serif)' }}>Terms of Use</h1>
          <p className="text-xs text-muted tracking-wide">Last updated 2026-04-26</p>
        </header>

        <section className="space-y-3 text-sm text-secondary leading-relaxed">
          <p>
            These Terms of Use ("Terms") govern your access to and use of sub-12 (the "Service"), developed and operated
            by <a href="https://eyup.io" target="_blank" rel="noopener noreferrer" className="text-[var(--brass)] hover:underline">EyUp.io</a>.
            By creating an account or using the Service, you agree to be bound by these Terms. If you do not agree, do not
            use the Service.
          </p>
          <p>
            These Terms govern the Service as operated by EyUp.io. The sub-12 software
            itself is separately licensed under the{' '}
            <a href="https://github.com/eyupio/sub12/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="text-[var(--brass)] hover:underline">AGPL-3.0</a> —
            these Terms are about the hosted service, not your rights in the code, and
            nothing here restricts what that licence grants you.
          </p>
        </section>

        <Section title="Eligibility">
          <p>
            You must be at least 13 years old (or the minimum age in your jurisdiction) and able to form a binding contract to use
            the Service. You are responsible for complying with all laws applicable to your activities, including any laws
            governing the use of firearms and air rifles in your jurisdiction.
          </p>
        </Section>

        <Section title="Your account">
          <p>
            You are responsible for maintaining the confidentiality of your credentials and for any activity under your account.
            Notify us immediately if you suspect unauthorized access. We may suspend or terminate accounts that violate these
            Terms or appear to be abused.
          </p>
        </Section>

        <Section title="Acceptable use">
          <ul className="list-disc pl-5 space-y-2">
            <li>Do not upload content that is illegal, harassing, hateful, or infringes others' rights.</li>
            <li>Do not submit falsified scores, pellet test results, or other data intended to mislead other users or league standings.</li>
            <li>Do not attempt to disrupt, reverse engineer, or gain unauthorized access to the Service or other accounts.</li>
            <li>Do not use the Service to give or receive advice that requires a firearms-safety, legal, medical, or other licensed professional.</li>
          </ul>
        </Section>

        <Section title="Your content">
          <p>
            You retain ownership of content you upload (score cards, images, comments). By submitting content, you grant us a
            non-exclusive, worldwide, royalty-free license to host, display, and process that content as needed to operate the
            Service, including showing it to other users where you have made it visible.
          </p>
        </Section>

        <Section title="Leagues, clubs, and competitions">
          <p>
            Leagues and clubs may have their own rules set by their organizers. By joining, you agree to those rules in addition
            to these Terms. Score verification, amendments, and rejections are subject to the league's process and audit trail.
          </p>
        </Section>

        <Section title="Disclaimers">
          <p>
            The Service is provided "as is" without warranties of any kind. Ballistics calculations, hole-detection measurements,
            and any other computed outputs are estimates for informational purposes only and should not be relied upon for safety,
            competition rulings, or regulatory compliance.
          </p>
        </Section>

        <Section title="Limitation of liability">
          <p>
            To the maximum extent permitted by law, sub-12 and its operators are not liable for indirect, incidental, special,
            consequential, or punitive damages, or any loss of data, profits, or goodwill arising from your use of the Service.
          </p>
        </Section>

        <Section title="Termination">
          <p>
            You may stop using the Service and delete your account at any time. We may suspend or terminate your access if you
            breach these Terms or if continued provision of the Service is no longer commercially feasible.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            We may update these Terms occasionally. Material changes will be communicated through the Service. Your continued use
            after changes take effect constitutes acceptance.
          </p>
        </Section>

        <Section title="Contact">
          <p>For questions about these Terms, contact us through the Support Center inside the app.</p>
        </Section>

        <footer className="pt-6 border-t border-subtle flex items-center justify-between text-xs">
          <Link to="/" className="text-muted hover:text-[var(--brass)] transition-colors">← Back to home</Link>
          <div className="flex items-center gap-3 text-muted">
            <Link to="/privacy" className="hover:text-[var(--brass)] transition-colors">Privacy</Link>
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
