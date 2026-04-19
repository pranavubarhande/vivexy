'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Send, Check, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';

const INTERESTS = [
  { value: 'legal-ai', label: 'Legal AI Workspace' },
  { value: 'financial-ai', label: 'Financial AI Workspace' },
  { value: 'compliance-ai', label: 'Compliance AI Workspace' },
  { value: 'request-demo', label: 'Request a Demo' },
  { value: 'enterprise', label: 'Enterprise / Custom Build' },
  { value: 'agency', label: 'Agency - Build for Clients' },
  { value: 'other', label: 'Something Else' },
];

function ContactForm() {
  const searchParams = useSearchParams();
  const interestParam = searchParams.get('interest') ?? 'request-demo';
  const planParam = searchParams.get('plan') ?? '';

  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    role: '',
    interest: INTERESTS.find((i) => i.value === interestParam)
      ? interestParam
      : 'request-demo',
    message: planParam ? `I'm interested in the ${planParam} plan.` : '',
  });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle'
  );

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_key: process.env.NEXT_PUBLIC_WEB3FORMS_KEY,
          subject: `[Agentis] ${INTERESTS.find((i) => i.value === form.interest)?.label ?? form.interest}`,
          from_name: form.name,
          name: form.name,
          email: form.email,
          company: form.company,
          role: form.role,
          interest: INTERESTS.find((i) => i.value === form.interest)?.label,
          message: form.message,
        }),
      });
      const data = await res.json();
      setStatus(data.success ? 'sent' : 'error');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'sent') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-16 space-y-4"
      >
        <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto">
          <Check className="w-7 h-7 text-green-500" />
        </div>
        <h2 className="font-serif text-3xl font-light">Message sent</h2>
        <p className="text-muted-foreground max-w-xs mx-auto">
          Thanks, We&apos;ll get back to you within one business day.
        </p>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/">Back to home</Link>
        </Button>
      </motion.div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Name *</label>
          <input
            required
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Jane Smith"
            className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Email *</label>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="jane@firm.com"
            className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Company / Firm</label>
          <input
            value={form.company}
            onChange={(e) => set('company', e.target.value)}
            placeholder="Meridian Legal Partners"
            className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Your Role</label>
          <input
            value={form.role}
            onChange={(e) => set('role', e.target.value)}
            placeholder="Managing Partner"
            className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">I&apos;m interested in</label>
        <select
          value={form.interest}
          onChange={(e) => set('interest', e.target.value)}
          className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {INTERESTS.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Message *</label>
        <textarea
          required
          rows={5}
          value={form.message}
          onChange={(e) => set('message', e.target.value)}
          placeholder="Tell me a bit about your firm and what you're looking to build…"
          className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
        />
      </div>

      {status === 'error' && (
        <p className="text-sm text-destructive">
          Something went wrong - please try again.
        </p>
      )}

      <Button
        type="submit"
        disabled={status === 'sending'}
        className="w-full sm:w-auto"
      >
        {status === 'sending' ? (
          'Sending…'
        ) : (
          <>
            Send message <Send className="ml-2 w-3.5 h-3.5" />
          </>
        )}
      </Button>
    </form>
  );
}

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-8 pb-20">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-10 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to home
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Bot className="w-4.5 h-4.5 text-primary-foreground" />
            </div>
            <span className="font-serif text-lg font-light">Agentis</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl font-light tracking-tight mb-3 mt-6">
            Let&apos;s talk
          </h1>
          <p className="text-muted-foreground mb-10 text-lg">
            Whether you want a demo, a custom build, or just to explore
            what&apos;s possible - we respond to every message.
          </p>

          <Suspense>
            <ContactForm />
          </Suspense>
        </motion.div>
      </div>
    </div>
  );
}
