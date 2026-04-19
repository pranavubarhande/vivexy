import Link from 'next/link';
import { ArrowLeft, Shield, Lock, Server, Eye } from 'lucide-react';

export const metadata = { title: 'Security — Agentis' };

const PRACTICES = [
  {
    icon: Server,
    title: 'Your infrastructure',
    body: 'Agentis deploys on infrastructure you control, your VPS, your cloud account, your private network. We never have access to your servers or data at rest.',
  },
  {
    icon: Lock,
    title: 'Encrypted in transit',
    body: 'All traffic between clients and your workspace is encrypted via TLS 1.2+. API keys and credentials are encrypted at rest using AES-256.',
  },
  {
    icon: Eye,
    title: 'No data exfiltration',
    body: 'Agent conversations, uploaded documents, and memory stores remain on your infrastructure. Agentis does not transmit your business data to any external service without your explicit configuration.',
  },
  {
    icon: Shield,
    title: 'Sandboxed execution',
    body: 'Code executed by agents runs in isolated containers with no network egress and read-only filesystem mounts by default. Execution policies are configurable per workspace.',
  },
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-8 pb-20">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-10 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to home
        </Link>
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-3">
          Legal
        </p>
        <h1 className="font-serif text-4xl font-light tracking-tight mb-2">
          Security
        </h1>
        <p className="text-muted-foreground mb-10 text-lg leading-relaxed">
          Security is structural, not bolted on. Agentis is built so your data
          never leaves your control.
        </p>

        <div className="space-y-6 mb-12">
          {PRACTICES.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className="flex gap-4 p-5 rounded-xl border border-border bg-card"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm mb-1">{p.title}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {p.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-6">
          <p className="font-semibold text-sm mb-1">Found a vulnerability?</p>
          <p className="text-sm text-muted-foreground mb-3">
            Please disclose responsibly via our{' '}
            <a
              href="/contact?interest=other"
              className="text-primary hover:underline"
            >
              contact form
            </a>{' '}
            and we will respond within 48 hours.
          </p>
        </div>
      </div>
    </div>
  );
}
