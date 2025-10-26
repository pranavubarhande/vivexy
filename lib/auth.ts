import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { User } from '@/types/user';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export const hashPassword = (password: string): Promise<string> => {
  return bcrypt.hash(password, 12);
};

export const verifyPassword = (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};

export const generateToken = (payload: {
  userId: string;
  email: string;
}): string => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as any);
};

export const verifyToken = (
  token: string
): { userId: string; email: string } | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & {
      userId: string;
      email: string;
    };
    return { userId: decoded.userId, email: decoded.email };
  } catch {
    return null;
  }
};

export const getUserFromToken = async (
  token: string,
  includePassword: boolean = false
): Promise<User | null> => {
  const payload = verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      avatar: true,
      createdAt: true,
      updatedAt: true,
      ...(includePassword ? { password: true } : {}),
    },
  });

  return user;
};

export const createUser = async (
  email: string,
  password: string,
  name: string
): Promise<User> => {
  const hashedPassword = await hashPassword(password);

  return prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
    },
  });
};

export const authenticateUser = async (
  email: string,
  password: string
): Promise<User | null> => {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) return null;

  const isValidPassword = await verifyPassword(password, user.password);
  if (!isValidPassword) return null;

  return user;
};

export const excludePassword = <T extends { password: string }>(
  user: T
): Omit<T, 'password'> => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
};
