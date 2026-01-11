import { NextRequest, NextResponse } from 'next/server';
import { stripe, getStripeWebhookSecret } from '@/lib/stripe';
import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { logStripeEvent } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe not configured' },
        { status: 500 }
      );
    }

    const sig = request.headers.get('stripe-signature');
    if (!sig)
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

    const rawBody = await request.text();
    const secret = getStripeWebhookSecret();

    let event: Stripe.Event;
    try {
      event = (await stripe.webhooks.constructEventAsync(
        rawBody,
        sig,
        secret
      )) as unknown as Stripe.Event;
    } catch (err) {
      console.error('Webhook signature verification failed.', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Persist raw event for auditing
    await logStripeEvent({ id: event.id, type: event.type, payload: event });

    // Handle events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId: string | undefined = session?.metadata?.userId;
        const teamId: string | undefined = session?.metadata?.teamId;
        const customerId: string | undefined = session?.customer as
          | string
          | undefined;
        const subscriptionId: string | undefined = session?.subscription as
          | string
          | undefined;

        if (subscriptionId) {
          await prisma.subscription.upsert({
            where: { stripeSubscriptionId: subscriptionId },
            create: {
              stripeSubscriptionId: subscriptionId,
              stripeCustomerId: customerId || null,
              status: 'ACTIVE',
              plan: 'PRO',
              userId: userId || null,
              teamId: teamId || null,
              currentPeriodStart: new Date(),
              currentPeriodEnd: null,
              cancelAtPeriodEnd: false,
            },
            update: {
              stripeCustomerId: customerId || null,
              status: 'ACTIVE',
            },
          });
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const amount = invoice.amount_paid as number;
        const currency = (invoice.currency as string) || 'usd';
        const stripeInvoiceId = invoice.id as string;

        // Attach to any user we find via metadata on subscription or leave null
        let userId: string | null = null;
        if (invoice.customer_email) {
          const user = await prisma.user.findUnique({
            where: { email: invoice.customer_email },
          });
          userId = user?.id ?? null;
        }

        await prisma.invoice.upsert({
          where: { stripeInvoiceId },
          create: {
            stripeInvoiceId,
            amount,
            currency: currency.toUpperCase(),
            status: invoice.status || 'paid',
            invoicePdf: invoice.invoice_pdf || null,
            hostedInvoiceUrl: invoice.hosted_invoice_url || null,
            userId: userId || process.env.STRIPE_FALLBACK_USER_ID || '',
            subscriptionId: null,
          },
          update: {
            amount,
            status: invoice.status || 'paid',
            invoicePdf: invoice.invoice_pdf || null,
            hostedInvoiceUrl: invoice.hosted_invoice_url || null,
          },
        });
        break;
      }
      case 'customer.subscription.updated': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sub = event.data.object as any;
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: {
            status: (sub.status || 'active').toUpperCase(),
            currentPeriodStart: sub.current_period_start
              ? new Date(sub.current_period_start * 1000)
              : null,
            currentPeriodEnd: sub.current_period_end
              ? new Date(sub.current_period_end * 1000)
              : null,
            cancelAtPeriodEnd: !!sub.cancel_at_period_end,
          },
        });
        break;
      }
      default:
        // No-op for other events
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
