'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Zap,
  Server,
  Shield,
  UserCheck,
  Lock,
  GitBranch,
  Brain,
  Globe,
  Database,
  Layers,
  Cpu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect, useRef } from 'react';
import { APP_NAME } from '@/constants/project';
import Image from 'next/image';
import {
  LongSessionDemo,
  SkillsDemo,
  MCPDemo,
  SandboxDemo,
  HITLDemo,
  GuardrailsDemo,
  SubAgentDemo,
  MemoryDemo,
  MultiPlatformDemo,
  ScaleDemo,
  PlugPlayDemo,
  ThemesDemo,
} from '@/components/landing/feature-demos';

const TEMPLATE_FEATURES = [
  {
    icon: Clock,
    title: 'Long-Session Agents',
    description:
      'Agents that persist state across hours-long tasks — no context loss, no restarts.',
    demo: LongSessionDemo,
  },
  {
    icon: Zap,
    title: 'Skills System',
    description:
      'Reusable /commands that inject custom instructions — build once, share across your team.',
    demo: SkillsDemo,
  },
  {
    icon: Server,
    title: 'MCP Servers',
    description:
      'Plug any external tool or data source into your agents via Model Context Protocol.',
    demo: MCPDemo,
  },
  {
    icon: Shield,
    title: 'Sandboxed Execution',
    description:
      'Isolated environments for code and tool execution — safe by design, always.',
    demo: SandboxDemo,
  },
  {
    icon: UserCheck,
    title: 'Human-in-the-Loop',
    description:
      'Approval gates and review checkpoints built into every workflow, not bolted on later.',
    demo: HITLDemo,
  },
  {
    icon: Lock,
    title: 'Guardrails',
    description:
      'Content policies, output validation, and safety layers that protect your clients.',
    demo: GuardrailsDemo,
  },
  {
    icon: GitBranch,
    title: 'Sub-Agent Orchestration',
    description:
      'Coordinate multiple specialized agents for complex, multi-step workflows.',
    demo: SubAgentDemo,
  },
  {
    icon: Brain,
    title: 'Memory Management',
    description:
      'Persistent, searchable agent memory — agents that genuinely learn over time.',
    demo: MemoryDemo,
  },
  {
    icon: Globe,
    title: 'Web + Desktop + Mobile',
    description:
      'One codebase delivers to browser, Windows, macOS, Linux, iOS, Android.',
    demo: MultiPlatformDemo,
  },
  {
    icon: Database,
    title: '$5 VPS → Enterprise Scale',
    description:
      'Deploy on a $5 VPS or scale to Terraform-managed read replicas — the same architecture OpenAI uses.',
    demo: ScaleDemo,
  },
  {
    icon: Layers,
    title: 'Plug-and-Play Architecture',
    description:
      'Swap models, tools, and providers without touching core agent logic.',
    demo: PlugPlayDemo,
  },
  {
    icon: Cpu,
    title: 'Multiple Themes',
    description:
      "White-label with your client's brand — full theming support out of the box.",
    demo: ThemesDemo,
  },
];

const BENEFITS = [
  {
    title: 'Battle-tested',
    description: 'Used in production by firms handling sensitive client data.',
  },
  {
    title: 'Fully extensible',
    description:
      'Add custom skills, tools, and integrations without breaking core logic.',
  },
  {
    title: 'White-label ready',
    description: 'Complete branding control - your clients never see us.',
  },
  {
    title: 'Source included',
    description: 'Full access to the codebase. You own what you deploy.',
  },
];

const USE_CASES = [
  {
    title: 'For agencies building for clients',
    description:
      'Deploy a proven workspace template for each new client. Customize workflows, branding, and integrations - then ship in days, not months.',
  },
  {
    title: 'For firms building internally',
    description:
      'Get a head start with our production-ready architecture. Customize everything to match your existing processes and compliance requirements.',
  },
];

export default function TemplatePage() {
  const [activeTab, setActiveTab] = useState(0);
  const [progress, setProgress] = useState(0);
  const [timerKey, setTimerKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const TICK_MS = 50;
  const ADVANCE_MS = 5000;

  useEffect(() => {
    let p = progress;
    const id = setInterval(() => {
      if (paused) return;
      p += (TICK_MS / ADVANCE_MS) * 100;
      setProgress(Math.min(p, 100));
      if (p >= 100) {
        p = 0;
        setActiveTab((prev: number) => (prev + 1) % TEMPLATE_FEATURES.length);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [timerKey, paused, progress]);

  useEffect(() => {
    const strip = stripRef.current;
    const card = cardRefs.current[activeTab];
    if (!strip || !card) return;
    strip.scrollTo({
      left: card.offsetLeft - strip.offsetWidth / 2 + card.offsetWidth / 2,
      behavior: 'smooth',
    });
  }, [activeTab]);

  const handleSelect = (idx: number) => {
    setActiveTab(idx);
    setProgress(0);
    setTimerKey((k) => k + 1);
    setPaused(false);
  };

  const togglePause = () => setPaused((p) => !p);

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
          </div>
        </div>
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
              For Agencies
            </Badge>
            <h1 className="font-serif text-4xl sm:text-5xl font-light tracking-tight mb-4">
              A complete AI workspace template
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Deploy production-grade AI workspaces for any client.
              Battle-tested, extensible, and fully white-label. Everything you
              need to deliver enterprise AI - without building from scratch.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
            {BENEFITS.map((benefit, i) => (
              <motion.div
                key={benefit.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="p-6 rounded-xl border border-border bg-card"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Check className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-medium mb-2">{benefit.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {benefit.description}
                </p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
            className="mb-16"
          >
            <h2 className="font-serif text-2xl font-light mb-8">
              What&apos;s included
            </h2>

            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4 min-h-[52px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-start gap-3"
                  >
                    {(() => {
                      const active = TEMPLATE_FEATURES[activeTab];
                      const Icon = active.icon;
                      return (
                        <>
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Icon className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-medium text-base">
                              {active.title}
                            </h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {active.description}
                            </p>
                          </div>
                        </>
                      );
                    })()}
                  </motion.div>
                </AnimatePresence>

                <button
                  onClick={togglePause}
                  title={paused ? 'Resume auto-advance' : 'Pause auto-advance'}
                  className="shrink-0 mt-0.5 w-8 h-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                >
                  {paused ? (
                    <Play className="w-3.5 h-3.5" />
                  ) : (
                    <Pause className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <div className="h-[420px] rounded-xl border border-border overflow-hidden bg-muted/10 relative overflow-x-hidden">
                <div className="absolute inset-0 overflow-y-auto no-scrollbar overflow-x-hidden">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeTab}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="absolute inset-0"
                    >
                      {(() => {
                        const DemoComp = TEMPLATE_FEATURES[activeTab].demo;
                        return DemoComp ? <DemoComp /> : null;
                      })()}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <div
                className="flex gap-2 overflow-x-auto pb-2 scrollbar-none no-scrollbar"
                ref={stripRef}
              >
                {TEMPLATE_FEATURES.map((f, i) => {
                  const Icon = f.icon;
                  return (
                    <button
                      key={f.title}
                      ref={(el) => {
                        cardRefs.current[i] = el;
                      }}
                      onClick={() => handleSelect(i)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border shrink-0 transition-colors ${
                        activeTab === i
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border bg-card text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-sm whitespace-nowrap">
                        {f.title}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-75"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
            className="mb-16"
          >
            <h2 className="font-serif text-2xl font-light mb-8">
              Who it&apos;s for
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {USE_CASES.map((useCase, i) => (
                <div
                  key={useCase.title}
                  className="p-6 rounded-xl border border-border bg-card"
                >
                  <h3 className="font-medium mb-3">{useCase.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {useCase.description}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <Button size="lg" asChild>
              <Link href="/contact?interest=agency">
                Get the template <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/contact?interest=request-demo">Request a demo</Link>
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function Play(props: React.ComponentProps<'svg'>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function Pause(props: React.ComponentProps<'svg'>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="4" height="16" x="6" y="4" />
      <rect width="4" height="16" x="14" y="4" />
    </svg>
  );
}
