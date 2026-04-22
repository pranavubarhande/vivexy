'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Brain,
  Shield,
  Menu,
  X,
  Lock,
  GitBranch,
  Database,
  Bot,
  FileText,
  BarChart3,
  Scale,
  Building2,
  UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { APP_NAME } from '@/constants/project';
import Image from 'next/image';

const workflows = [
  {
    id: 'legal',
    label: 'Legal',
    icon: Scale,
    headline: 'From clause to courtroom-ready',
    description:
      'AI agents that review contracts, surface risks, generate briefs, and keep counsel in control at every checkpoint.',
    fullDescription:
      'Our legal AI workflow automates the entire contract lifecycle - from initial review to final brief generation. Every decision point includes human checkpoints ensuring compliance and accuracy.',
    steps: [
      { label: 'Upload Contract', type: 'ai', icon: FileText },
      { label: 'Extract Clauses', type: 'ai', icon: Brain },
      { label: 'Flag Risks', type: 'ai', icon: Shield },
      { label: 'Counsel Review', type: 'human', icon: UserCheck },
      { label: 'Brief Generated', type: 'ai', icon: FileText },
    ],
    pills: [
      'Contract Analysis',
      'Case Research',
      'Brief Drafting',
      'Compliance Audit',
    ],
    features: [
      'Automated clause extraction and categorization',
      'Risk scoring with severity indicators',
      'Precedent matching across your knowledge base',
      'Human-in-the-loop approval gates',
      'Audit trail for every AI-generated output',
      'Export to Word, PDF, or directly to your DMS',
    ],
  },
  {
    id: 'financial',
    label: 'Financial',
    icon: BarChart3,
    headline: 'Portfolio intelligence at every level',
    description:
      'Automated data ingestion, real-time risk scoring, regulatory compliance checks, and exec-ready reports - all wired into your existing stack.',
    fullDescription:
      'Transform how your financial team analyzes portfolios. Our AI workflow ingests data from multiple sources, performs comprehensive analysis, and generates board-ready reports with full audit trails.',
    steps: [
      { label: 'Ingest Data', type: 'ai', icon: Database },
      { label: 'Analyse Portfolio', type: 'ai', icon: BarChart3 },
      { label: 'Risk Scoring', type: 'ai', icon: Shield },
      { label: 'Analyst Review', type: 'human', icon: UserCheck },
      { label: 'Report Out', type: 'ai', icon: FileText },
    ],
    pills: [
      'Portfolio Analysis',
      'Risk Assessment',
      'Reg Compliance',
      'Exec Reporting',
    ],
    features: [
      'Multi-source data ingestion (APIs, CSV, Excel)',
      'Real-time risk scoring and alerts',
      'Regulatory compliance verification',
      'Automated report generation',
      'Scenario modeling and projections',
      'Executive dashboard with drill-down',
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    icon: Shield,
    headline: 'Always audit-ready, never scrambling',
    description:
      'Map policies to regulations automatically, identify gaps before auditors do, and generate immutable audit trails with human sign-off baked in.',
    fullDescription:
      'Stay ahead of regulatory requirements with intelligent policy mapping and gap analysis. Our compliance workflow ensures you are always prepared for audits with complete traceability.',
    steps: [
      { label: 'Upload Policy', type: 'ai', icon: FileText },
      { label: 'Regulation Map', type: 'ai', icon: GitBranch },
      { label: 'Gap Analysis', type: 'ai', icon: Shield },
      { label: 'Compliance Lead', type: 'human', icon: UserCheck },
      { label: 'Audit Trail', type: 'ai', icon: Lock },
    ],
    pills: [
      'Policy Mapping',
      'Gap Analysis',
      'Audit Trails',
      'Remediation Tracking',
    ],
    features: [
      'Automated regulation-to-policy mapping',
      'Real-time gap identification',
      'Remediation task assignment and tracking',
      'Complete audit trail generation',
      'Compliance calendar management',
      'Evidence collection and organization',
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: Building2,
    headline: 'Ops that actually scale with your firm',
    description:
      'Intelligent onboarding assistants, policy Q&A bots, and smart routing - so your ops team spends time on decisions, not repetition.',
    fullDescription:
      'Empower your operations team with AI that handles repetitive tasks intelligently. From onboarding to policy questions, our workflow ensures consistency and speed.',
    steps: [
      { label: 'Query Intake', type: 'ai', icon: Bot },
      { label: 'Policy Lookup', type: 'ai', icon: FileText },
      { label: 'AI Response', type: 'ai', icon: Brain },
      { label: 'Escalate if Needed', type: 'human', icon: UserCheck },
      { label: 'Resolution Logged', type: 'ai', icon: Check },
    ],
    pills: ['Onboarding Bots', 'Policy Q&A', 'Smart Routing', 'Task Tracking'],
    features: [
      'Intelligent query routing',
      'Automated onboarding workflows',
      'Policy Q&A with source citations',
      'Escalation management',
      'Knowledge base auto-updates',
      'SLA monitoring and alerts',
    ],
  },
];

function WorkflowStep({
  step,
  index,
  total,
}: {
  step: (typeof workflows)[0]['steps'][0];
  index: number;
  total: number;
}) {
  const Icon = step.icon;
  const isHuman = step.type === 'human';
  return (
    <div className="flex items-center gap-0">
      <div className="flex flex-col items-center gap-1.5">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center border-2 shrink-0 transition-colors ${
            isHuman
              ? 'border-amber-600/60 bg-amber-50 dark:bg-amber-950/30'
              : 'border-primary/50 bg-primary/8'
          }`}
        >
          <Icon
            className={`w-4 h-4 ${isHuman ? 'text-amber-700' : 'text-primary'}`}
          />
        </div>
        <span className="text-[10px] font-medium text-center leading-tight max-w-[64px]">
          {step.label}
        </span>
        <span
          className={`text-[9px] uppercase tracking-wider font-semibold ${
            isHuman ? 'text-amber-600' : 'text-primary/70'
          }`}
        >
          {step.type === 'human' ? 'Human' : 'AI'}
        </span>
      </div>
      {index < total - 1 && (
        <div className="flex items-center mb-6 mx-1">
          <div className="w-6 h-px border-t-2 border-dashed border-border" />
          <ChevronRight className="w-3 h-3 text-muted-foreground -ml-1" />
        </div>
      )}
    </div>
  );
}

function WorkflowSection() {
  const [activeTab, setActiveTab] = useState(0);
  const active = workflows[activeTab];
  const ActiveIcon = active.icon;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ActiveIcon className="w-5 h-5 text-primary" />
          </div>
          <h3 className="font-serif text-2xl font-light">{active.headline}</h3>
        </div>
        <p className="text-muted-foreground leading-relaxed">
          {active.fullDescription}
        </p>
        <div className="flex flex-wrap gap-2">
          {active.pills.map((p) => (
            <span
              key={p}
              className="text-xs px-3 py-1 rounded-full border border-primary/30 text-primary bg-primary/5 font-medium"
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-6">
          Workflow Pipeline
        </p>
        <div className="flex items-start flex-wrap gap-y-4">
          {active.steps.map((step, i) => (
            <WorkflowStep
              key={step.label}
              step={step}
              index={i}
              total={active.steps.length}
            />
          ))}
        </div>
        <div className="mt-6 pt-4 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary/60" />
            AI Agent Step
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500/70" />
            Human Checkpoint
          </span>
        </div>
      </div>
    </div>
  );
}

export default function WorkflowsPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const active = workflows[activeTab];

  return (
    <div className="min-h-screen bg-background">
      <motion.nav
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed top-0 w-full z-50 bg-background/90 backdrop-blur-md border-b border-border"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-2.5">
              <Image
                src="/logo.png"
                alt={APP_NAME}
                width={28}
                height={28}
                className="rounded-md object-contain"
              />
              <span className="font-serif text-xl font-light tracking-tight">
                {APP_NAME}
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              {[
                { label: 'Workflows', href: '/workflows' },
                { label: 'Template', href: '/template' },
                { label: 'Integrations', href: '/integrations' },
                { label: 'Insights', href: '/insights' },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/pricing"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Pricing
              </Link>
            </div>

            <div className="hidden md:flex items-center gap-3">
              <Button size="sm" variant="ghost" asChild>
                <Link href="/contact?interest=request-demo">Contact</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/contact?interest=request-demo">Get started</Link>
              </Button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-background border-t border-border"
            >
              <div className="px-4 py-4 space-y-3">
                {[
                  { label: 'Workflows', href: '/workflows' },
                  { label: 'Template', href: '/template' },
                  { label: 'Integrations', href: '/integrations' },
                  { label: 'Insights', href: '/insights' },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="pt-3 flex flex-col gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/contact?interest=request-demo">Contact</Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link href="/contact?interest=request-demo">
                      Get started
                    </Link>
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      <div className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-12 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to home
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
            className="mb-16"
          >
            <Badge
              variant="outline"
              className="border-primary/40 text-primary bg-primary/5 font-medium text-xs px-3 py-1 mb-4"
            >
              AI Workflows
            </Badge>
            <h1 className="font-serif text-4xl sm:text-5xl font-light tracking-tight mb-4">
              Built for your industry
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Every professional domain has its own rhythm. We map AI to yours -
              not the other way around. Choose a workflow to learn more.
            </p>
          </motion.div>

          <div className="flex mb-10 border-b border-border overflow-x-auto no-scrollbar">
            {workflows.map((w, i) => {
              const Icon = w.icon;
              return (
                <button
                  key={w.id}
                  onClick={() => setActiveTab(i)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap shrink-0 ${
                    activeTab === i
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {w.label}
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={active.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
            >
              <WorkflowSection />
            </motion.div>
          </AnimatePresence>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
            className="mt-20"
          >
            <h2 className="font-serif text-2xl font-light mb-8">
              What each workflow includes
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {active.features.map((feature) => (
                <div
                  key={feature}
                  className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card"
                >
                  <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-16 flex flex-col sm:flex-row gap-3"
          >
            <Button size="lg" asChild>
              <Link href="/contact?interest=custom-workflow">
                Discuss custom workflow <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/template">See the template</Link>
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
