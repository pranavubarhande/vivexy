import { withAuth } from '@/middlewares/auth';
import { NextRequest, NextResponse } from 'next/server';
import { getUserJobs, createJob } from '@/business-logic/jobs';

export const GET = withAuth(async (request: NextRequest, user) => {
  try {
    const jobs = await getUserJobs(user.id);
    return NextResponse.json(jobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async (request: NextRequest, user) => {
  try {
    const body = await request.json();
    const { name, analysisPrompt, selectedStocks, runAtTime } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Job name is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(selectedStocks)) {
      return NextResponse.json(
        { error: 'Selected stocks must be an array' },
        { status: 400 }
      );
    }

    if (!runAtTime || typeof runAtTime !== 'string') {
      return NextResponse.json(
        { error: 'Run time is required' },
        { status: 400 }
      );
    }

    const job = await createJob(
      {
        name: name.trim(),
        analysisPrompt: analysisPrompt?.trim() || undefined,
        selectedStocks,
        runAtTime,
      },
      user.id
    );

    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    console.error('Error creating job:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
});
