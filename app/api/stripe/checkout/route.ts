import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { authMiddleware } from '@/middlewares/auth';

export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe not configured' },
        { status: 500 }
      );
    }

    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) return authResult;

    const { user } = authResult;
    const body = await request.json();
    const {
      priceId,
      mode = 'subscription',
      teamId,
    } = body as {
      priceId: string;
      mode?: 'subscription' | 'payment';
      teamId?: string;
    };

    if (!priceId) {
      return NextResponse.json({ error: 'Missing priceId' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/(dashboard)/billing?success=1`,
      cancel_url: `${appUrl}/(dashboard)/billing?canceled=1`,
      metadata: {
        userId: user.id,
        teamId: teamId || '',
      },
      customer_email: user.email || undefined,
    });

    return NextResponse.json({ id: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
