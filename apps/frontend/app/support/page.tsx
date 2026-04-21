import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Mail,
  FileText,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/constants/project';

export const metadata = { title: `Support — ${APP_NAME}` };

const TOPICS = [
  'Setting up my workspace',
  'Connecting an MCP server',
  'Adding a custom AI model',
  'Human-in-the-loop configuration',
  'Billing or plan question',
  'Bug report',
  'Something else',
];

export default function SupportPage() {
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
          Help
        </p>
        <h1 className="font-serif text-4xl font-light tracking-tight mb-2">
          Support
        </h1>
        <p className="text-muted-foreground mb-10 text-lg leading-relaxed">
          We respond to every message - usually within one business day.
        </p>

        {/* Options */}
        <div className="space-y-3 mb-10">
          <Link
            href="/contact?interest=other"
            className="flex items-center gap-4 p-5 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors group"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">Send a message</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use the contact form - describe your issue and we&apos;ll get
                back to you.
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </Link>

          <a
            href="mailto:pranavubarhande@gmail.com"
            className="flex items-center gap-4 p-5 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors group"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">Email directly</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Reach us by email for urgent issues.
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </a>
        </div>

        {/* Common topics */}
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-4">
            Common topics
          </p>
          <div className="space-y-1">
            {TOPICS.map((topic) => (
              <Link
                key={topic}
                href={`/contact?interest=other&message=${encodeURIComponent(topic)}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-sm text-muted-foreground hover:text-foreground group"
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                {topic}
                <ArrowRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
