import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { APP_NAME } from '@/constants/project';

export const metadata = { title: `Terms of Service — ${APP_NAME}` };

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: April 2025
        </p>

        <div className="prose prose-sm max-w-none text-foreground space-y-8">
          <section>
            <h2 className="font-semibold text-base mb-2">1. Acceptance</h2>
            <p className="text-muted-foreground leading-relaxed">
              By using {APP_NAME} or engaging our services, you agree to these
              terms. If you are entering into these terms on behalf of a company
              or other legal entity, you represent that you have the authority
              to bind that entity.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2">2. Services</h2>
            <p className="text-muted-foreground leading-relaxed">
              {APP_NAME} provides AI workspace software and implementation
              services for professional teams. The scope, deliverables, and
              timelines for any engagement are agreed in writing before work
              begins.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2">
              3. Use restrictions
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              You may not use {APP_NAME} to process unlawful content,
              reverse-engineer the platform, or resell access without a written
              agency or white-label agreement. You are responsible for all
              activity that occurs under your account.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2">
              4. Intellectual property
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              You retain full ownership of the data and documents you process
              through {APP_NAME}. We retain ownership of the platform,
              templates, and underlying software. Custom builds delivered under
              an enterprise engagement are licensed to you under the terms of
              that agreement.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2">
              5. Limitation of liability
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              To the maximum extent permitted by law, {APP_NAME} shall not be
              liable for indirect, incidental, or consequential damages. Our
              total liability for any claim shall not exceed the fees paid in
              the three months preceding the claim.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2">6. Governing law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These terms are governed by applicable law. Disputes shall be
              resolved through good-faith negotiation before any formal
              proceedings.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2">7. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              Questions about these terms?{' '}
              <a
                href="/contact?interest=other"
                className="text-primary hover:underline"
              >
                Get in touch
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
