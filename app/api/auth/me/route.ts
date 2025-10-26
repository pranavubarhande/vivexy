import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/middlewares/auth';

export const GET = withAuth(async (request: NextRequest, user) => {
  return NextResponse.json(user);
});
