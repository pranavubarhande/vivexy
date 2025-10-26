import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export const getAllStocks = async () => {
  return await prisma.stock.findMany({
    orderBy: {
      symbol: 'asc',
    },
  });
};

export const searchStocks = async ({
  query,
  page = 1,
  limit = 50,
}: {
  query?: string;
  page?: number;
  limit?: number;
}) => {
  const skip = (page - 1) * limit;

  let where: Prisma.StockWhereInput = {};

  if (query && query.trim()) {
    where = {
      OR: [
        {
          symbol: {
            contains: query.trim(),
            mode: 'insensitive',
          },
        },
        {
          name: {
            contains: query.trim(),
            mode: 'insensitive',
          },
        },
      ],
    };
  }

  const [stocks, total] = await Promise.all([
    prisma.stock.findMany({
      where,
      orderBy: {
        symbol: 'asc',
      },
      take: limit,
      skip,
    }),
    prisma.stock.count({ where }),
  ]);

  return {
    stocks,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    },
  };
};
