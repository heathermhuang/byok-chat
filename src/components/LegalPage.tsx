import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { useEffect } from 'react'
import { openPrivacySettings } from '../lib/privacy'

export type LegalPageKind = 'privacy' | 'terms' | 'cookies'

const EFFECTIVE_DATE = 'July 15, 2026'
const OPERATOR_NAME = import.meta.env.VITE_OPERATOR_NAME?.trim() || 'BYOK Chat'
const CONTACT_EMAIL = import.meta.env.VITE_LEGAL_CONTACT_EMAIL?.trim() || 'privacy@byok.chat'

export function legalPageKind(pathname: string): LegalPageKind | null {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  if (normalized === '/privacy') return 'privacy'
  if (normalized === '/terms') return 'terms'
  if (normalized === '/cookies') return 'cookies'
  return null
}

function LegalNav({ current }: { current: LegalPageKind }) {
  return (
    <nav className="legal-nav" aria-label="Legal pages">
      <a aria-current={current === 'privacy' ? 'page' : undefined} href="/privacy">Privacy</a>
      <a aria-current={current === 'terms' ? 'page' : undefined} href="/terms">Terms</a>
      <a aria-current={current === 'cookies' ? 'page' : undefined} href="/cookies">Cookies</a>
    </nav>
  )
}

function PrivacyPolicy() {
  return (
    <>
      <p className="legal-lede">BYOK Chat is designed around browser-local storage. This policy explains the smaller set of information that leaves your device when you use the service, optional analytics, and your choices.</p>

      <section>
        <h2>1. Who operates this service</h2>
        <p>{OPERATOR_NAME} operates byok.chat and is responsible for the site-level processing described here. Questions and privacy requests can be sent to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </section>

      <section>
        <h2>2. What stays in your browser</h2>
        <p>Profiles, provider base URLs, selected models, settings, and thread history are stored in your browser. API keys can be stored as browser data or encrypted locally with a passphrase. The passphrase is not saved. Generated media and attachment bytes are not deliberately persisted in thread history.</p>
        <p>Browser-local does not mean that model requests never leave your device. When you send a message, the current request and the credentials needed to authenticate it pass through the BYOK Chat Cloudflare Worker and are forwarded to the provider you selected.</p>
      </section>

      <section>
        <h2>3. Information we process</h2>
        <ul>
          <li><strong>Request data:</strong> prompts, relevant thread context, selected settings, attachments, provider endpoint, and API credentials used for the active request.</li>
          <li><strong>Operational data:</strong> IP address, request time, route, response status, security signals, and similar delivery metadata processed by Cloudflare and short-lived service logs.</li>
          <li><strong>Optional analytics:</strong> if you consent, page path without query parameters, page title, session statistics, approximate geography, and browser/device information. We do not send prompts, thread content, profile names, model IDs, API keys, form values, or custom user identifiers to Google Analytics.</li>
          <li><strong>Support data:</strong> information you choose to include when contacting us.</li>
        </ul>
      </section>

      <section>
        <h2>4. Why we process it</h2>
        <ul>
          <li>To deliver the service you request, route model and tool calls, and return responses.</li>
          <li>To secure, debug, and maintain the Worker and prevent abuse.</li>
          <li>To understand page-level usage and improve the product when you consent to analytics.</li>
          <li>To answer support, legal, and privacy requests.</li>
        </ul>
        <p>Depending on where you live, the relevant legal bases are performance of a contract or steps requested by you, legitimate interests in security and service reliability, legal obligations, and consent for optional analytics.</p>
      </section>

      <section>
        <h2>5. Who receives information</h2>
        <ul>
          <li><strong>Cloudflare</strong> hosts and protects the site and Worker.</li>
          <li><strong>Your selected AI provider</strong> receives model requests under the account and terms connected to your API key.</li>
          <li><strong>Search or reader services</strong>, including Jina or a custom service, receive a query or public URL only when you enable and use those tools.</li>
          <li><strong>Google Analytics</strong> receives limited site-usage data only after consent.</li>
          <li><strong>Authorities or advisers</strong> may receive information when required by law or reasonably necessary to protect rights, users, and the service.</li>
        </ul>
        <p>Each provider may process information in other countries. Review your chosen provider's privacy terms before sending sensitive or regulated data.</p>
      </section>

      <section>
        <h2>6. Retention and security</h2>
        <p>Browser-local data remains until you delete it in the app, clear site data, or remove the browser profile. Request content is held in Worker memory only as needed to complete the request; we do not intentionally create a server-side chat archive. Operational logs are retained only as needed for security and reliability. Consented GA4 event-level data may be retained for up to 14 months, while first-party GA cookies are configured to expire within 12 months.</p>
        <p>We use HTTPS, restrictive browser security headers, endpoint allowlisting, local encryption options, and data minimisation. No online service is risk-free. Treat a provider key stored without passphrase encryption as readable by anyone who can access that browser profile or execute code in it.</p>
      </section>

      <section>
        <h2>7. Your rights and choices</h2>
        <p>You can view, export, correct, or delete browser-local profiles and threads using the app controls. You can withdraw analytics consent at any time through Privacy settings. Depending on your jurisdiction, you may also request access, correction, deletion, restriction, portability, or objection for personal data under our control, and complain to your local data protection authority.</p>
        <p>We do not sell personal information or share it for cross-context behavioural advertising. We do not knowingly discriminate against people for exercising privacy rights.</p>
      </section>

      <section>
        <h2>8. Children and policy changes</h2>
        <p>The service is not directed to children under 16, and we do not knowingly collect their personal information. We may update this policy when the service or law changes. Material changes will be highlighted in the product, and the effective date above will be revised.</p>
      </section>
    </>
  )
}

function TermsOfUse() {
  return (
    <>
      <p className="legal-lede">These terms govern access to BYOK Chat. The service connects credentials and providers you control; it does not provide or resell model access.</p>

      <section>
        <h2>1. Agreement and eligibility</h2>
        <p>By using the service, you agree to these terms and the Privacy Policy. You must be at least 18 years old or the age of legal majority where you live and able to enter a binding agreement. If you use BYOK Chat for an organisation, you represent that you can bind it.</p>
      </section>

      <section>
        <h2>2. Your providers and credentials</h2>
        <p>You supply and control provider accounts, API keys, endpoints, model access, and related charges. You are responsible for safeguarding credentials, confirming endpoint authenticity, monitoring provider usage, and complying with each provider's terms and policies. BYOK Chat is not responsible for provider availability, output, pricing, quotas, retention, or account actions.</p>
      </section>

      <section>
        <h2>3. Acceptable use</h2>
        <p>You may not use the service to violate law or third-party rights; distribute malware; bypass provider safeguards or access controls; probe or disrupt the service; expose credentials belonging to someone else; generate or distribute unlawful abuse material; or use automated traffic that materially degrades service for others.</p>
      </section>

      <section>
        <h2>4. Your content and model output</h2>
        <p>You retain rights you already hold in prompts, files, and other content you submit. You grant us a limited permission to process that content solely to operate, secure, and support the service. Model output may be inaccurate, incomplete, offensive, or non-unique. Verify important output and do not rely on it as professional legal, medical, financial, safety, or other high-stakes advice.</p>
      </section>

      <section>
        <h2>5. Service changes and availability</h2>
        <p>We may modify, suspend, or discontinue features, impose reasonable limits, or block abusive traffic. We aim to preserve browser-local data formats, but you should export anything important. The service may change as provider APIs and browser capabilities change.</p>
      </section>

      <section>
        <h2>6. Intellectual property and feedback</h2>
        <p>BYOK Chat software, branding, and documentation are protected by applicable intellectual-property laws. These terms do not transfer ownership. If you provide feedback, you permit us to use it without restriction or payment, provided we do not identify you publicly without permission.</p>
      </section>

      <section>
        <h2>7. Disclaimers</h2>
        <p>To the maximum extent permitted by law, the service is provided “as is” and “as available,” without warranties of merchantability, fitness for a particular purpose, non-infringement, accuracy, availability, security, or compatibility. Nothing in these terms excludes rights or warranties that cannot legally be excluded.</p>
      </section>

      <section>
        <h2>8. Limitation of liability</h2>
        <p>To the maximum extent permitted by law, {OPERATOR_NAME} will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages; loss of data, credentials, profits, revenue, or goodwill; provider charges; or losses caused by model output or third-party services. Our aggregate liability for claims relating to the free service will not exceed US$100. These limits do not apply where prohibited or to liability that cannot legally be limited.</p>
      </section>

      <section>
        <h2>9. Suspension, termination, and law</h2>
        <p>You may stop using the service at any time and clear browser-local data. We may restrict access for material breach, abuse, security risk, or legal necessity. Mandatory consumer protections and conflict-of-law rules in your jurisdiction continue to apply. Before any formal claim, contact <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> so we can try to resolve it informally.</p>
      </section>
    </>
  )
}

function CookiePolicy() {
  return (
    <>
      <p className="legal-lede">This policy covers cookies and similar browser storage used by byok.chat. Optional analytics stays off until you actively allow it.</p>

      <section>
        <h2>1. Required browser storage</h2>
        <p>BYOK Chat uses first-party local storage to provide the workspace you request. This is not an advertising cookie, but privacy rules may treat local storage and cookies similarly because both store information on your device.</p>
        <div className="legal-table-wrap">
          <table>
            <thead><tr><th>Storage</th><th>Purpose</th><th>Duration</th></tr></thead>
            <tbody>
              <tr><td><code>byok.chat.profiles.v1</code></td><td>Saved profiles, settings, and locally stored or encrypted credentials.</td><td>Until you delete profiles or clear site data.</td></tr>
              <tr><td><code>byok.chat.threads.v2</code></td><td>Local thread history and workspace state.</td><td>Until you delete threads or clear site data.</td></tr>
              <tr><td><code>byok.chat.consent.v1</code></td><td>Your privacy choice and its timestamp.</td><td>Up to 180 days, then we ask again.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>2. Optional Google Analytics</h2>
        <p>If you allow analytics, the Google tag may set the following first-party cookies. Advertising storage, advertising user data, advertising personalisation, and Google Signals remain disabled.</p>
        <div className="legal-table-wrap">
          <table>
            <thead><tr><th>Cookie</th><th>Purpose</th><th>Configured duration</th></tr></thead>
            <tbody>
              <tr><td><code>_ga</code></td><td>Distinguishes pseudonymous site visitors.</td><td>Up to 12 months.</td></tr>
              <tr><td><code>_ga_&lt;id&gt;</code></td><td>Maintains session state for this site.</td><td>Up to 12 months.</td></tr>
            </tbody>
          </table>
        </div>
        <p>We use basic consent mode: no Google tag or consent ping is sent before opt-in. Analytics page locations exclude query parameters, and no prompts, form values, profile names, thread titles, model IDs, or API keys are deliberately sent.</p>
      </section>

      <section>
        <h2>3. Change your choice</h2>
        <p>You can allow or withdraw analytics at any time. Withdrawing consent tells the loaded tag to deny analytics storage and removes GA cookies accessible to this site. Browser settings can also block or delete cookies and local storage, but clearing required storage removes saved profiles, credentials, and threads.</p>
        <button className="button primary legal-settings-button" type="button" onClick={openPrivacySettings}><ShieldCheck size={16} /> Open privacy settings</button>
      </section>

      <section>
        <h2>4. Changes and contact</h2>
        <p>We will update this policy and request fresh consent if storage purposes materially change. Questions can be sent to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </section>
    </>
  )
}

const PAGE_META: Record<LegalPageKind, { eyebrow: string; title: string; description: string }> = {
  privacy: {
    eyebrow: 'Data and privacy',
    title: 'Privacy Policy',
    description: 'How BYOK Chat handles browser-local data, provider requests, service logs, and optional analytics.',
  },
  terms: {
    eyebrow: 'Service agreement',
    title: 'Terms of Use',
    description: 'The rules and responsibilities for using BYOK Chat with provider accounts and credentials you control.',
  },
  cookies: {
    eyebrow: 'Storage choices',
    title: 'Cookie Policy',
    description: 'Required browser storage, optional Google Analytics cookies, and how to change your choice.',
  },
}

export function LegalPage({ kind }: { kind: LegalPageKind }) {
  const meta = PAGE_META[kind]

  useEffect(() => {
    document.title = `${meta.title} · BYOK Chat`
    document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description)
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', `${meta.title} · BYOK Chat`)
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', meta.description)
    const pageUrl = `${window.location.origin}/${kind}`
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', pageUrl)
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', pageUrl)
  }, [kind, meta.description, meta.title])

  return (
    <main className="legal-shell">
      <header className="legal-header">
        <a className="legal-brand" href="/" aria-label="Back to BYOK Chat">
          <span className="brand-mark"><span>BYOK</span></span>
          <span><strong>BYOK Chat</strong><small>Private model workspace</small></span>
        </a>
        <LegalNav current={kind} />
      </header>

      <article className="legal-document">
        <a className="legal-back" href="/"><ArrowLeft size={15} /> Back to workspace</a>
        <p className="eyebrow">{meta.eyebrow}</p>
        <h1>{meta.title}</h1>
        <p className="legal-description">{meta.description}</p>
        <p className="legal-date">Effective <time dateTime="2026-07-15">{EFFECTIVE_DATE}</time></p>
        {kind === 'privacy' ? <PrivacyPolicy /> : kind === 'terms' ? <TermsOfUse /> : <CookiePolicy />}
      </article>

      <footer className="legal-footer">
        <span>© 2026 {OPERATOR_NAME}</span>
        <LegalNav current={kind} />
        <button type="button" onClick={openPrivacySettings}>Privacy settings</button>
      </footer>
    </main>
  )
}
