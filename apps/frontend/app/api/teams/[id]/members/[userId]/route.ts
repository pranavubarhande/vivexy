import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from '@/middlewares/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const authResult = await authMiddleware(request);

    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user } = authResult;
    const { id: teamId, userId: memberUserId } = await params;

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
          error:
            'Access denied. Only team owners and admins can remove members.',
        },
        { status: 403 }
      );
    }

    // Check if the team exists
    const team = await prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Prevent removing the team owner
    if (memberUserId === team.ownerId) {
      return NextResponse.json(
        { error: 'Cannot remove the team owner' },
        { status: 400 }
      );
    }

    // Check if member exists
    const member = await prisma.teamMember.findFirst({
      where: {
        teamId,
        userId: memberUserId,
      },
    });

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Remove member
    await prisma.teamMember.delete({
      where: {
        id: member.id,
      },
    });

    return NextResponse.json({
      message: 'Member removed successfully',
    });
  } catch (error) {
    console.error('Remove member error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
