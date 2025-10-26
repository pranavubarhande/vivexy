import { NextRequest, NextResponse } from 'next/server';
import { searchStocks } from '@/business-logic/stocks';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Validate pagination parameters
    const validPage = Math.max(1, page);
    const validLimit = Math.min(Math.max(10, limit), 100); // Between 10 and 100

    const result = await searchStocks({
      query: query || undefined,
      page: validPage,
      limit: validLimit,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching stocks:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
