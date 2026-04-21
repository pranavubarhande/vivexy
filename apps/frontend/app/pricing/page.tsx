'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/constants/project';
import Image from 'next/image';

const PLANS = [
  {
    name: 'Agency Template',
    priceRange: '$2,000 - $5,000',
    description:
      'A production-ready AI workspace template your agency can deploy for clients. Includes all core features, plug-and-play architecture, and a white-label-ready codebase.',
    cta: 'Get the template',
    href: '/contact?interest=agency&plan=agency-template',
    highlight: false,
    features: [
      'Full source code delivery',
      'Multi-model support (Claude, GPT-4o, Gemini)',
      'Sub-agent orchestration',
      'Human-in-the-loop gates',
      'Sandboxed code execution',
      'MCP server integration',
      'Skills & slash commands',
      'White-label ready',
      '30-day post-delivery support',
    ],
  },
  {
    name: 'Enterprise Solution',
    priceRange: '$2,000 - $40,000',
    description:
      'We scope, build, and deploy a fully custom AI workspace on your infrastructure. Price varies with complexity, integrations, and team size.',
    cta: 'Start a conversation',
    href: '/contact?interest=enterprise&plan=enterprise',
    highlight: true,
    features: [
      'Everything in Agency Template',
      'Custom scoping and architecture',
      'Built to your existing workflows',
      'On-premise / private cloud deploy',
      'Custom branding and themes',
      'Compliance and audit trail setup',
      'Dedicated account manager',
      'SLA and long-term support options',
      'Pricing based on requirements',
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-20">
        {/* Back */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-12 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to home
        </Link>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-16"
        >
          <div className="flex items-center gap-2.5 mb-6">
            <Image
              src="/logo.png"
              alt={APP_NAME}
              width={28}
              height={28}
              className="rounded-md object-contain"
            />
            <span className="font-serif text-lg font-light">{APP_NAME}</span>
          </div>
          <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-3">
            Pricing
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl font-light tracking-tight mb-4">
            Two ways to work with us.
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl">
            Get a battle-tested template you can deploy yourself, or let us
            build a fully custom solution from the ground up.
          </p>
        </motion.div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: i * 0.1 }}
              className={`relative flex flex-col rounded-2xl border p-8 ${
                plan.highlight
                  ? 'border-primary bg-primary/5 shadow-lg'
                  : 'border-border bg-card'
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-8 text-[10px] uppercase tracking-widest font-semibold px-3 py-1 rounded-full bg-primary text-primary-foreground">
                  Custom build
                </span>
              )}
              <div className="mb-6">
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                  {plan.name}
                </p>
                <div className="mb-3">
                  <span className="font-serif text-3xl font-light">
                    {plan.priceRange}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {plan.description}
                </p>
              </div>

              <ul className="space-y-2.5 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <Button
                asChild
                variant={plan.highlight ? 'default' : 'outline'}
                className="w-full"
              >
                <Link href={plan.href}>
                  {plan.cta} <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
                </Link>
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
