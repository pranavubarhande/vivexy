'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { APP_NAME } from '@/constants/project';
import Image from 'next/image';
import { useState } from 'react';

const articles = [
  {
    category: 'Engineering',
    title:
      'AI for Everyone: A Practical Guide to Using Large Language Models in Your Business',
    excerpt:
      'How to use AI tools for your business, from simple to complex, with practical examples and step-by-step guides.',
    link: 'https://medium.com/mynextdeveloper/ai-for-everyone-a-practical-guide-to-using-large-language-models-in-your-business-82c9dabbb667',
    date: 'December 2025',
  },
  {
    category: 'Engineering',
    title: 'Long-Session Agents: The Architecture That Makes It Work',
    excerpt:
      "Most agent frameworks lose context after a single turn. Here's how we built persistent, resumable agents that survive hours-long workflows.",
    link: 'https://medium.com/@pranavubarhande3/long-session-agents-the-architecture-that-makes-it-work-d911ef86c2b0',
    date: 'November 2025',
  },
  {
    category: 'Legal AI',
    title: 'Why Human-in-the-Loop Is Not Optional for Legal AI',
    excerpt:
      'Fully autonomous agents are impressive, but in high-stakes professional settings, the real value comes from knowing exactly when to stop.',
    link: 'https://medium.com/@pranavubarhande3/why-human-in-the-loop-is-not-optional-for-legal-ai-51fabcc0494b',
    date: 'October 2025',
  },
];

const categories = [
  { label: 'All', value: null },
  { label: 'Engineering', value: 'Engineering' },
  { label: 'Legal AI', value: 'Legal AI' },
];

export default function InsightsPage() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filteredArticles = activeCategory
    ? articles.filter((a) => a.category === activeCategory)
    : articles;

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
              Journal
            </Badge>
            <h1 className="font-serif text-4xl sm:text-5xl font-light tracking-tight mb-4">
              From the field
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Thoughts on building AI for professional services, lessons learned
              from deployments, and what we&apos;re seeing in the industry.
            </p>
          </motion.div>

          <div className="flex gap-2 mb-10 overflow-x-auto pb-2 scrollbar-none">
            {categories.map((cat) => {
              const isActive =
                cat.value === activeCategory ||
                (cat.value === null && activeCategory === null);
              const articleCount = cat.value
                ? articles.filter((a) => a.category === cat.value).length
                : articles.length;
              return (
                <button
                  key={cat.label}
                  onClick={() => setActiveCategory(cat.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium shrink-0 transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {cat.label}
                  {articleCount > 0 && (
                    <span className="ml-2 text-xs opacity-70">
                      ({articleCount})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {filteredArticles.map((article, i) => (
              <motion.a
                key={article.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group border border-border rounded-xl bg-card overflow-hidden hover:border-primary/30 transition-colors block"
              >
                <div className="h-2 bg-primary/15 group-hover:bg-primary/25 transition-colors" />
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs uppercase tracking-widest text-primary font-semibold">
                      {article.category}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {article.date}
                    </span>
                  </div>
                  <h3 className="font-serif text-lg font-light leading-snug mb-3 group-hover:text-primary transition-colors">
                    {article.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                    {article.excerpt}
                  </p>
                  <div className="flex items-center gap-1 text-sm font-medium text-primary">
                    Read on Medium{' '}
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </motion.a>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-16"
          >
            <div className="p-8 rounded-2xl border border-border bg-muted/20 text-center">
              <h2 className="font-serif text-2xl font-light mb-3">
                Want to stay updated?
              </h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                We share updates on new features, industry insights, and
                behind-the-scenes looks at how we build AI for professional
                services.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
                <Button size="lg" asChild>
                  <Link href="/contact?interest=newsletter">
                    Subscribe to updates <ArrowRight className="ml-2 w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
