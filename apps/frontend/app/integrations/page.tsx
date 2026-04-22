'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { APP_NAME } from '@/constants/project';
import Image from 'next/image';

const toolGroups = [
  {
    label: 'AI Models',
    description: 'Choose from industry-leading large language models',
    tools: [
      {
        name: 'Claude',
        color: '#C96442',
        abbr: 'Cl',
        icon: 'anthropic.svg',
        description: "Anthropic's Claude for advanced reasoning",
      },
      {
        name: 'GPT-4o',
        color: '#10A37F',
        abbr: 'GP',
        icon: 'openai.svg',
        description: "OpenAI's flagship model",
      },
      {
        name: 'Gemini',
        color: '#4285F4',
        abbr: 'Ge',
        icon: 'googlegemini.svg',
        description: "Google's multimodal model",
      },
      {
        name: 'Ollama',
        color: '#111827',
        abbr: 'Ol',
        icon: 'ollama.svg',
        description: 'Run models locally',
      },
      {
        name: 'Mistral',
        color: '#FF7000',
        abbr: 'Mi',
        icon: 'mistralai.svg',
        description: "Mistral AI's efficient models",
      },
      {
        name: 'Groq',
        color: '#F55036',
        abbr: 'Gq',
        icon: null,
        description: 'Fast inference API',
      },
    ],
  },
  {
    label: 'Frameworks',
    description: 'Build agents with the best open-source frameworks',
    tools: [
      {
        name: 'LangChain',
        color: '#1C7A5C',
        abbr: 'LC',
        icon: 'langchain.svg',
        description: 'Standard for LLM app development',
      },
      {
        name: 'LangGraph',
        color: '#1C5C4A',
        abbr: 'LG',
        icon: 'langgraph.svg',
        description: 'Agent orchestration framework',
      },
      {
        name: 'LlamaIndex',
        color: '#7C3AED',
        abbr: 'LI',
        icon: null,
        description: 'Data framework for LLMs',
      },
      {
        name: 'HuggingFace',
        color: '#F59E0B',
        abbr: 'HF',
        icon: 'huggingface.svg',
        description: 'Models and datasets',
      },
    ],
  },
  {
    label: 'Automation',
    description: 'Connect with your existing automation stack',
    tools: [
      {
        name: 'n8n',
        color: '#EA4B71',
        abbr: 'n8',
        icon: 'n8n.svg',
        description: 'Powerful workflow automation',
      },
      {
        name: 'Make',
        color: '#6D4AFF',
        abbr: 'Mk',
        icon: 'make.svg',
        description: 'Visual automation platform',
      },
      {
        name: 'Zapier',
        color: '#FF4A00',
        abbr: 'Za',
        icon: 'zapier.svg',
        description: 'Connect 5,000+ apps',
      },
      {
        name: 'Temporal',
        color: '#0052CC',
        abbr: 'Tm',
        icon: 'temporal.svg',
        description: 'Workflow orchestration',
      },
    ],
  },
  {
    label: 'Infrastructure',
    description: 'Deploy anywhere - from VPS to cloud enterprise',
    tools: [
      {
        name: 'AWS',
        color: '#FF9900',
        abbr: 'AW',
        icon: 'aws.svg',
        description: 'Amazon Web Services',
      },
      {
        name: 'GCP',
        color: '#4285F4',
        abbr: 'GC',
        icon: 'googlecloud.svg',
        description: 'Google Cloud Platform',
      },
      {
        name: 'Terraform',
        color: '#7B42BC',
        abbr: 'Tf',
        icon: 'terraform.svg',
        description: 'Infrastructure as code',
      },
      {
        name: 'Docker',
        color: '#2496ED',
        abbr: 'Do',
        icon: 'docker.svg',
        description: 'Container platform',
      },
    ],
  },
];

const benefits = [
  {
    title: 'Model-agnostic',
    description:
      'Switch between models with a single configuration change. Test performance and cost across providers.',
  },
  {
    title: 'MCP integration',
    description:
      'Connect any tool via the Model Context Protocol. Our architecture makes it simple to add new capabilities.',
  },
  {
    title: 'Your stack, your rules',
    description:
      'Bring your existing tools and data sources. We adapt to your infrastructure, not the other way around.',
  },
  {
    title: 'Enterprise-ready',
    description:
      'SOC 2 compliant deployments with full audit trails, role-based access, and data residency options.',
  },
];

function ToolCard({ tool }: { tool: (typeof toolGroups)[0]['tools'][0] }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors">
      <div
        className="w-10 h-10 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0"
        style={{ backgroundColor: tool.color }}
      >
        {tool.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/icons/tools/${tool.icon}`}
            alt={tool.name}
            width={20}
            height={20}
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        ) : (
          tool.abbr
        )}
      </div>
      <div>
        <h3 className="font-medium text-sm">{tool.name}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {tool.description}
        </p>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
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
              Integrations
            </Badge>
            <h1 className="font-serif text-4xl sm:text-5xl font-light tracking-tight mb-4">
              Works with your entire stack
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Plug in the AI models, automation tools, and infrastructure your
              team already trusts - or try something new. Our architecture is
              designed to be model-agnostic and highly extensible.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
            {benefits.map((benefit, i) => (
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

          {toolGroups.map((group, groupIdx) => (
            <motion.div
              key={group.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: groupIdx * 0.1 }}
              className="mb-16"
            >
              <div className="mb-6">
                <h2 className="font-serif text-2xl font-light mb-2">
                  {group.label}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {group.description}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.tools.map((tool) => (
                  <ToolCard key={tool.name} tool={tool} />
                ))}
              </div>
            </motion.div>
          ))}

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <Button size="lg" asChild>
              <Link href="/contact?interest=custom-integration">
                Request an integration <ArrowRight className="ml-2 w-4 h-4" />
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
