'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
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
  FileText,
  BarChart3,
  Scale,
  UserCheck,
  ArrowUpRight,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { useAuthSafe } from '@/components/shared/auth-provider';
import { TemplateShowcase } from '@/components/landing/feature-demos';
import { APP_NAME } from '@/constants/project';
import Image from 'next/image';

/* ─── animation presets ─────────────────────────────────────────────── */
const fadeUp = {
  initial: { opacity: 0, y: 32 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
};
const stagger = { animate: { transition: { staggerChildren: 0.08 } } };

/* ─── data ───────────────────────────────────────────────────────────── */
const workflows = [
  {
    id: 'legal',
    label: 'Legal',
    icon: Scale,
    headline: 'From clause to courtroom-ready',
    description:
      'AI agents that review contracts, surface risks, generate briefs, and keep counsel in control at every checkpoint.',
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
  },
  {
    id: 'financial',
    label: 'Financial',
    icon: BarChart3,
    headline: 'Portfolio intelligence at every level',
    description:
      'Automated data ingestion, real-time risk scoring, regulatory compliance checks, and exec-ready reports - all wired into your existing stack.',
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
  },
  {
    id: 'compliance',
    label: 'Compliance',
    icon: Shield,
    headline: 'Always audit-ready, never scrambling',
    description:
      'Map policies to regulations automatically, identify gaps before auditors do, and generate immutable audit trails with human sign-off baked in.',
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
  },
];

const toolGroups = [
  {
    label: 'AI Models',
    tools: [
      { name: 'Claude', color: '#C96442', abbr: 'Cl', icon: 'anthropic.svg' },
      { name: 'GPT-4o', color: '#10A37F', abbr: 'GP', icon: 'openai.svg' },
      {
        name: 'Gemini',
        color: '#4285F4',
        abbr: 'Ge',
        icon: 'googlegemini.svg',
      },
      { name: 'Ollama', color: '#111827', abbr: 'Ol', icon: 'ollama.svg' },
      { name: 'Mistral', color: '#FF7000', abbr: 'Mi', icon: 'mistralai.svg' },
      { name: 'Groq', color: '#F55036', abbr: 'Gq', icon: null },
    ],
  },
  {
    label: 'Frameworks',
    tools: [
      {
        name: 'LangChain',
        color: '#1C7A5C',
        abbr: 'LC',
        icon: 'langchain.svg',
      },
      {
        name: 'LangGraph',
        color: '#1C5C4A',
        abbr: 'LG',
        icon: 'langgraph.svg',
      },
      { name: 'LlamaIndex', color: '#7C3AED', abbr: 'LI', icon: null },
      {
        name: 'HuggingFace',
        color: '#F59E0B',
        abbr: 'HF',
        icon: 'huggingface.svg',
      },
    ],
  },
  {
    label: 'Automation',
    tools: [
      { name: 'n8n', color: '#EA4B71', abbr: 'n8', icon: 'n8n.svg' },
      { name: 'Make', color: '#6D4AFF', abbr: 'Mk', icon: 'make.svg' },
      { name: 'Zapier', color: '#FF4A00', abbr: 'Za', icon: 'zapier.svg' },
      { name: 'Temporal', color: '#0052CC', abbr: 'Tm', icon: 'temporal.svg' },
    ],
  },
  {
    label: 'Infrastructure',
    tools: [
      { name: 'AWS', color: '#FF9900', abbr: 'AW', icon: 'aws.svg' },
      { name: 'GCP', color: '#4285F4', abbr: 'GC', icon: 'googlecloud.svg' },
      {
        name: 'Terraform',
        color: '#7B42BC',
        abbr: 'Tf',
        icon: 'terraform.svg',
      },
      { name: 'Docker', color: '#2496ED', abbr: 'Do', icon: 'docker.svg' },
    ],
  },
];

const allTools = toolGroups.flatMap((g) => g.tools);
const marqueeRow1 = allTools.slice(0, Math.ceil(allTools.length / 2));
const marqueeRow2 = allTools.slice(Math.ceil(allTools.length / 2));

function ToolChip({ tool }: { tool: (typeof allTools)[0] }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-border bg-card shrink-0">
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center text-white text-[10px] font-bold shrink-0"
        style={{ backgroundColor: tool.color }}
      >
        {tool.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/icons/tools/${tool.icon}`}
            alt={tool.name}
            width={16}
            height={16}
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        ) : (
          tool.abbr
        )}
      </div>
      <span className="text-sm font-medium whitespace-nowrap">{tool.name}</span>
    </div>
  );
}

function ToolMarquee() {
  return (
    <div className="space-y-3 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <div className="flex gap-3 animate-marquee-left">
        {[...marqueeRow1, ...marqueeRow1].map((tool, i) => (
          <ToolChip key={`r1-${i}`} tool={tool} />
        ))}
      </div>
      <div className="flex gap-3 animate-marquee-right">
        {[...marqueeRow2, ...marqueeRow2].map((tool, i) => (
          <ToolChip key={`r2-${i}`} tool={tool} />
        ))}
      </div>
    </div>
  );
}

const articles = [
  {
    category: 'Engineering',
    title:
      'AI for Everyone: A Practical Guide to Using Large Language Models in Your Business',
    excerpt:
      'How to use AI tools for your business, from simple to complex, with practical examples and step-by-step guides.',
    link: 'https://medium.com/mynextdeveloper/ai-for-everyone-a-practical-guide-to-using-large-language-models-in-your-business-82c9dabbb667',
  },
  {
    category: 'Engineering',
    title: 'Long-Session Agents: The Architecture That Makes It Work',
    excerpt:
      "Most agent frameworks lose context after a single turn. Here's how we built persistent, resumable agents that survive hours-long workflows.",
    link: 'https://medium.com/@pranavubarhande3/long-session-agents-the-architecture-that-makes-it-work-d911ef86c2b0',
  },
  {
    category: 'Legal AI',
    title: 'Why Human-in-the-Loop Is Not Optional for Legal AI',
    excerpt:
      'Fully autonomous agents are impressive, but in high-stakes professional settings, the real value comes from knowing exactly when to stop.',
    link: 'https://medium.com/@pranavubarhande3/why-human-in-the-loop-is-not-optional-for-legal-ai-51fabcc0494b',
  },
];

/* ─── sub-components ─────────────────────────────────────────────────── */

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
    <section className="py-24 px-4 sm:px-6 lg:px-8 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
          className="mb-12"
        >
          <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-3">
            Built for your industry
          </p>
          <h2 className="font-serif text-4xl sm:text-5xl font-light tracking-tight mb-4">
            AI workflows shaped to{' '}
            <em className="not-italic text-primary">your</em> practice
          </h2>
          <p className="text-muted-foreground max-w-xl">
            Every professional domain has its own rhythm. We map AI to yours -
            not the other way around.
          </p>
        </motion.div>

        {/* Tab bar */}
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
            className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start"
          >
            {/* Text side */}
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ActiveIcon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-serif text-2xl font-light">
                  {active.headline}
                </h3>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                {active.description}
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

            {/* Workflow visual */}
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
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ─── main page ──────────────────────────────────────────────────────── */

export default function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isAuthenticated } = useAuthSafe();

  return (
    <div className="h-screen no-scrollbar bg-background flex flex-col overflow-auto">
      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <motion.nav
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed top-0 w-full z-50 bg-background/90 backdrop-blur-md border-b border-border"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
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

            {/* Desktop links */}
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

            {/* CTA */}
            <div className="hidden md:flex items-center gap-3">
              {isAuthenticated ? (
                <Button size="sm" asChild>
                  <a href="/chat">
                    Dashboard <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
                  </a>
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href="/contact?interest=request-demo">Contact</Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link
                      href={
                        process.env.NEXT_PUBLIC_AUTH_ENABLED
                          ? '/login'
                          : '/contact?interest=request-demo'
                      }
                    >
                      Get started
                    </Link>
                  </Button>
                </>
              )}
            </div>

            {/* Mobile toggle */}
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

        {/* Mobile menu */}
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

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial="initial"
            animate="animate"
            variants={stagger}
            className="max-w-4xl"
          >
            <motion.div variants={fadeUp} className="mb-6">
              <Badge
                variant="outline"
                className="border-primary/40 text-primary bg-primary/5 font-medium text-xs px-3 py-1"
              >
                AI Workspace Platform for Professional Firms
              </Badge>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="font-serif text-5xl sm:text-6xl lg:text-7xl font-light tracking-tight leading-[1.08] mb-8"
            >
              Build AI workspaces that work like{' '}
              <em className="not-italic text-primary">your team</em> does
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="text-xl text-muted-foreground max-w-2xl leading-relaxed mb-10"
            >
              We help Legal, Financial, and Compliance firms build intelligent
              AI workspaces around their existing workflows - or deploy our
              proven template so your agency can serve clients at scale.
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="flex flex-col sm:flex-row gap-3 mb-12"
            >
              {isAuthenticated ? (
                <Button size="lg" asChild className="text-base">
                  <a href="/chat">
                    Open workspace <ArrowRight className="ml-2 w-4 h-4" />
                  </a>
                </Button>
              ) : (
                <>
                  <Button size="lg" asChild className="text-base">
                    <Link href="/contact?interest=request-demo">
                      Build my workspace <ArrowRight className="ml-2 w-4 h-4" />
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    asChild
                    className="text-base"
                  >
                    <a href="#template">
                      For agencies <ArrowUpRight className="ml-2 w-4 h-4" />
                    </a>
                  </Button>
                </>
              )}
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="flex flex-wrap gap-6 text-sm text-muted-foreground"
            >
              {[
                'Human-in-the-loop by default',
                'Multi-platform deployment',
                'No lock-in architecture',
              ].map((t) => (
                <span key={t} className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-primary" />
                  {t}
                </span>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── STATS BAR ────────────────────────────────────────────────────── */}
      <section className="py-10 px-4 sm:px-6 lg:px-8 border-y border-border bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: '50+', label: 'AI tools supported' },
              { value: '5×', label: 'faster average workflow' },
              { value: '4', label: 'deployment targets' },
              { value: '100%', label: 'yours to own & white-label' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="font-serif text-4xl font-light text-primary mb-1">
                  {stat.value}
                </p>
                <p className="text-xs text-muted-foreground uppercase tracking-widest">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUSTED BY ───────────────────────────────────────────────────── */}
      <section className="py-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-8">
            Trusted by forward-thinking firms
          </p>
          <div className="flex flex-wrap justify-center gap-x-12 gap-y-4">
            {[
              'Meridian Legal Partners',
              'Vantage Capital Group',
              'Nexus Advisory',
              'Crest Compliance Co.',
              'Arion Financial',
            ].map((name) => (
              <span
                key={name}
                className="text-sm font-medium text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── WORKFLOWS ────────────────────────────────────────────────────── */}
      <div id="workflows">
        <WorkflowSection />
      </div>

      {/* ── FOR AGENCIES / TEMPLATE ──────────────────────────────────────── */}
      <section
        id="template"
        className="py-24 px-4 sm:px-6 lg:px-8 bg-muted/20 border-t border-border"
      >
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
            className="mb-16"
          >
            <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-3">
              For agencies
            </p>
            <h2 className="font-serif text-4xl sm:text-5xl font-light tracking-tight mb-4 max-w-3xl">
              A complete AI workspace template - deploy for any client
            </h2>
            <p className="text-muted-foreground max-w-xl">
              Everything your agency needs to deliver production-grade AI
              workspaces. Battle-tested, extensible, and fully white-label.
            </p>
          </motion.div>

          <TemplateShowcase />

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-10 flex flex-col sm:flex-row gap-3"
          >
            <Button size="lg" asChild>
              <Link href="/contact?interest=agency">
                Get the template <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/contact?interest=request-demo">See a demo</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ── TOOLS ────────────────────────────────────────────────────────── */}
      <section
        id="tools"
        className="py-24 px-4 sm:px-6 lg:px-8 border-t border-border"
      >
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
            className="mb-14"
          >
            <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-3">
              Integrations
            </p>
            <h2 className="font-serif text-4xl sm:text-5xl font-light tracking-tight mb-4">
              Works with your entire stack
            </h2>
            <p className="text-muted-foreground max-w-xl">
              Plug in the AI models, automation tools, and infrastructure your
              team already trusts - or try something new.
            </p>
          </motion.div>

          <ToolMarquee />
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-muted/20 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
            className="text-center mb-16"
          >
            <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-3">
              Process
            </p>
            <h2 className="font-serif text-4xl sm:text-5xl font-light tracking-tight">
              From kickoff to deployed in weeks
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {[
              {
                step: '01',
                title: 'Workflow Discovery',
                description:
                  'We map your existing processes, identify automation opportunities, and design where AI fits your practice - not a generic template.',
              },
              {
                step: '02',
                title: 'Build & Configure',
                description:
                  'Agents, skills, integrations, and guardrails are configured to your domain. Your team reviews every checkpoint before go-live.',
              },
              {
                step: '03',
                title: 'Deploy & Scale',
                description:
                  'Launch on the infrastructure that fits your risk profile - from a $5 VPS to a multi-region, read-replica enterprise deployment.',
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="relative"
              >
                <div className="font-serif text-6xl font-light text-primary/20 mb-4 leading-none">
                  {item.step}
                </div>
                <h3 className="font-medium text-lg mb-3">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── INSIGHTS / BLOG ──────────────────────────────────────────────── */}
      <section
        id="insights"
        className="py-24 px-4 sm:px-6 lg:px-8 bg-muted/20 border-t border-border"
      >
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
            className="flex items-end justify-between mb-12"
          >
            <div>
              <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-3">
                Journal
              </p>
              <h2 className="font-serif text-4xl sm:text-5xl font-light tracking-tight">
                From the field
              </h2>
            </div>
            <a
              href="https://medium.com/@pranavubarhande3"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              All articles <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </motion.div>

          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {articles.map((a) => (
              <motion.a
                key={a.title}
                variants={fadeUp}
                href={a.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group border border-border rounded-xl bg-card overflow-hidden hover:border-primary/30 transition-colors block"
              >
                <div className="h-2 bg-primary/15 group-hover:bg-primary/25 transition-colors" />
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs uppercase tracking-widest text-primary font-semibold">
                      {a.category}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Read on Medium
                    </span>
                  </div>
                  <h3 className="font-serif text-lg font-light leading-snug mb-3 group-hover:text-primary transition-colors">
                    {a.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {a.excerpt}
                  </p>
                  <div className="flex items-center gap-1 mt-5 text-sm font-medium text-primary">
                    Read{' '}
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </motion.a>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
          >
            <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-light tracking-tight mb-6">
              Ready to transform how{' '}
              <em className="not-italic text-primary">your firm</em> works?
            </h2>
            <p className="text-xl text-muted-foreground mb-10 max-w-xl mx-auto">
              Whether you&apos;re a firm building for yourself or an agency
              building for clients - let&apos;s start with a conversation.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {isAuthenticated ? (
                <Button size="lg" asChild className="text-base">
                  <a href="/chat">
                    Go to workspace <ArrowRight className="ml-2 w-4 h-4" />
                  </a>
                </Button>
              ) : (
                <>
                  <Button size="lg" asChild className="text-base">
                    <Link href="/contact?interest=request-demo">
                      Start building <ArrowRight className="ml-2 w-4 h-4" />
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    asChild
                    className="text-base"
                  >
                    <Link href="/pricing">See pricing</Link>
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-10">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <Image
                  src="/logo.png"
                  alt={APP_NAME}
                  width={28}
                  height={28}
                  className="rounded-md object-contain"
                />
                <span className="font-serif text-xl font-light">
                  {APP_NAME}
                </span>
              </div>
              <p className="text-sm text-muted-foreground max-w-xs">
                AI workspaces built around the way professional teams actually
                work.
              </p>
            </div>

            {/* Links */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-12 gap-y-6">
              {[
                {
                  heading: 'Product',
                  links: ['Workflows', 'Template', 'Integrations', 'Pricing'],
                },
                {
                  heading: 'Company',
                  links: ['Insights', 'Contact', 'Support'],
                },
                {
                  heading: 'Legal',
                  links: ['Privacy', 'Terms', 'Security'],
                },
              ].map((col) => (
                <div key={col.heading}>
                  <p className="text-xs uppercase tracking-widest font-semibold text-muted-foreground mb-3">
                    {col.heading}
                  </p>
                  <ul className="space-y-2">
                    {col.links.map((link) => {
                      const href =
                        link === 'Pricing'
                          ? '/pricing'
                          : link === 'Privacy'
                            ? '/privacy'
                            : link === 'Terms'
                              ? '/terms'
                              : link === 'Security'
                                ? '/security'
                                : link === 'Support'
                                  ? '/support'
                                  : link === 'Contact'
                                    ? '/contact'
                                    : link === 'Insights'
                                      ? '/insights'
                                      : link === 'Workflows'
                                        ? '/workflows'
                                        : link === 'Template'
                                          ? '/template'
                                          : link === 'Integrations'
                                            ? '/integrations'
                                            : '#';
                      return (
                        <li key={link}>
                          <Link
                            href={href}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {link}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-6 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-muted-foreground">
            <span>
              © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
            </span>
            <span>Built for Legal, Financial &amp; Compliance teams.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
