import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authMiddleware } from '@/middlewares/auth';
import { prisma } from '@/lib/prisma';
import { generateRandomToken } from '@/utils/common';
import { addHours } from 'date-fns';

const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
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

    // Check if user has access to the team
    const teamMember = await prisma.teamMember.findFirst({
      where: {
        teamId,
        userId: user.id,
      },
    });

    if (!teamMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get team members
    const members = await prisma.teamMember.findMany({
      where: { teamId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
      orderBy: [{ role: 'desc' }, { joinedAt: 'asc' }],
    });

    return NextResponse.json({
      members,
    });
  } catch (error) {
    console.error('Get team members error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
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
    const { email, role } = inviteMemberSchema.parse(body);

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
            'Access denied. Only team owners and admins can invite members.',
        },
        { status: 403 }
      );
    }

    // Check if user is already a member
    const existingMember = await prisma.teamMember.findFirst({
      where: {
        teamId,
        user: {
          email,
        },
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: 'User is already a member of this team' },
        { status: 400 }
      );
    }

    // Check if there's already a pending invite
    const existingInvite = await prisma.teamInvite.findFirst({
      where: {
        teamId,
        email,
      },
    });

    if (existingInvite) {
      return NextResponse.json(
        { error: 'There is already a pending invite for this email' },
        { status: 400 }
      );
    }

    // Check if the invited user exists
    const invitedUser = await prisma.user.findUnique({
      where: { email },
    });

    if (invitedUser) {
      // Add user directly as member
      await prisma.teamMember.create({
        data: {
          teamId,
          userId: invitedUser.id,
          role,
        },
      });

      return NextResponse.json({
        message: 'Member added successfully',
      });
    } else {
      // Create invite
      const token = generateRandomToken(32);
      const expiresAt = addHours(new Date(), 168); // 7 days

      await prisma.teamInvite.create({
        data: {
          email,
          role,
          token,
          teamId,
          invitedBy: user.id,
          expiresAt,
        },
      });

      // TODO: Send invite email here

      return NextResponse.json({
        message: 'Invite sent successfully',
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', message: error.issues[0].message },
        { status: 400 }
      );
    }

    console.error('Invite member error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
