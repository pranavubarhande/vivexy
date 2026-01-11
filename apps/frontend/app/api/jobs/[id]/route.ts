import { withAuth } from '@/middlewares/auth';
import { NextRequest, NextResponse } from 'next/server';
import { getUserJob, updateJob, deleteJob } from '@/business-logic/jobs';

export const GET = withAuth(
  async (
    request: NextRequest,
    user,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      const { id } = await params;

      const job = await getUserJob(id);
      return NextResponse.json(job);
    } catch (error) {
      console.error('Error fetching job:', error);
      if (error instanceof Error && error.message === 'Job not found') {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : 'Internal server error',
        },
        { status: 500 }
      );
    }
  }
);

export const PUT = withAuth(
  async (
    request: NextRequest,
    user,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      const { id } = await params;

      const body = await request.json();
      const { name, analysisPrompt, runAtTime, isActive } = body;

      const job = await updateJob(id, {
        name: name?.trim(),
        analysisPrompt: analysisPrompt?.trim(),
        runAtTime,
        isActive,
      });

      return NextResponse.json(job);
    } catch (error) {
      console.error('Error updating job:', error);
      if (error instanceof Error && error.message === 'Job not found') {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : 'Internal server error',
        },
        { status: 500 }
      );
    }
  }
);

export const DELETE = withAuth(
  async (
    request: NextRequest,
    user,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      const { id } = await params;

      await deleteJob(id);
      return NextResponse.json({ message: 'Job deleted successfully' });
    } catch (error) {
      console.error('Error deleting job:', error);
      if (error instanceof Error && error.message === 'Job not found') {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : 'Internal server error',
        },
        { status: 500 }
      );
    }
  }
);
