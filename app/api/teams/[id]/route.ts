import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authMiddleware } from '@/middlewares/auth';
import { prisma } from '@/lib/prisma';
import { slugify } from '@/utils/common';

const updateTeamSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await authMiddleware(request);

    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user } = authResult;
    const { id: teamId } = await params;

    // Check if team exists and user has access
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        OR: [
          { ownerId: user.id },
          {
            members: {
              some: {
                userId: user.id,
              },
            },
          },
        ],
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found or access denied' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      team,
    });
  } catch (error) {
    console.error('Get team error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await authMiddleware(request);

    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user } = authResult;
    const { id: teamId } = await params;
    const body = await request.json();
    const updateData = updateTeamSchema.parse(body);

    // Check if user is owner or admin of the team
    const teamMember = await prisma.teamMember.findFirst({
      where: {
        teamId,
        userId: user.id,
        role: {
          in: ['OWNER', 'ADMIN'],
        },
      },
    });

    if (!teamMember) {
      return NextResponse.json(
        {
          error: 'Access denied. Only team owners and admins can update teams.',
        },
        { status: 403 }
      );
    }

    // Update team
    const updatedTeam = await prisma.team.update({
      where: { id: teamId },
      data: {
        ...updateData,
        ...(updateData.name && { slug: slugify(updateData.name) }),
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    return NextResponse.json({
      team: updatedTeam,
      message: 'Team updated successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', message: error.issues[0].message },
        { status: 400 }
      );
    }

    console.error('Update team error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await authMiddleware(request);

    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user } = authResult;
    const { id: teamId } = await params;

    // Check if user is owner of the team
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        ownerId: user.id,
      },
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Access denied. Only team owners can delete teams.' },
        { status: 403 }
      );
    }

    // Delete team (this will cascade delete members and invites)
    await prisma.team.delete({
      where: { id: teamId },
    });

    return NextResponse.json({
      message: 'Team deleted successfully',
    });
  } catch (error) {
    console.error('Delete team error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
