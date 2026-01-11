import { prisma } from '@/lib/prisma';

export const logStripeEvent = async (params: {
  id: string;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
}) => {
  try {
    await prisma.stripeEventLog.create({
      data: {
        rawId: params.id,
        type: params.type,
        payload: params.payload,
      },
    });
  } catch (e) {
    console.error('Failed to persist Stripe event log', e);
  }
};
