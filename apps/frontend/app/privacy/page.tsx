import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { APP_NAME } from '@/constants/project';

export const metadata = { title: `Privacy Policy — ${APP_NAME}` };

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: April 2025
        </p>

        <div className="prose prose-sm max-w-none text-foreground space-y-8">
          <section>
            <h2 className="font-semibold text-base mb-2">
              1. Information we collect
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We collect information you provide directly, such as your name,
              email address, company, and messages submitted through our contact
              form. We also collect standard server logs (IP address, browser
              type, pages visited) for security and performance monitoring.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2">
              2. How we use your information
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Information is used solely to respond to your enquiries, deliver
              the services you request, and improve our product. We do not sell,
              rent, or share your personal data with third parties for marketing
              purposes.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2">3. Data storage</h2>
            <p className="text-muted-foreground leading-relaxed">
              Contact form submissions are processed via Web3Forms and delivered
              directly to our inbox. We retain enquiry data for up to 24 months.
              Workspace data is stored on infrastructure you control - we do not
              have access to your documents or agent conversations.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2">4. Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use only essential session cookies required for authentication.
              No third-party tracking or advertising cookies are used.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2">5. Your rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              You may request access to, correction of, or deletion of your
              personal data at any time by using our{' '}
              <a
                href="/contact?interest=other"
                className="text-primary hover:underline"
              >
                contact form
              </a>
              .
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2">6. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              Questions about this policy?{' '}
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
