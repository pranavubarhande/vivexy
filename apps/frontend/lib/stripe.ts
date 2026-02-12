import Stripe from 'stripe';

const stripeSecret = process.env.STRIPE_SECRET_KEY;

if (!stripeSecret) {
  // In dev we may run without Stripe; callers should guard usage.
  console.warn(
    'STRIPE_SECRET_KEY is not set. Stripe features will be disabled.'
  );
}

export const stripe = stripeSecret
  ? new Stripe(stripeSecret, {
      apiVersion: '2025-10-29.clover',
      typescript: true,
    })
  : (null as unknown as Stripe);

export const getStripeWebhookSecret = () => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  return secret;
};
