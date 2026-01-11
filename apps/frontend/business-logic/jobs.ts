import { prisma } from '@/lib/prisma';
import { CreateJobData, UpdateJobData } from '@/services/jobs.service';
import { Prisma } from '@prisma/client';

export const getUserJobs = async (userId: string) => {
  return await prisma.job.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
};

export const getUserJob = async (id: string) => {
  const job = await prisma.job.findFirst({
    where: {
      id,
    },
  });

  if (!job) {
    throw new Error('Job not found');
  }

  return job;
};

export const createJob = async (data: CreateJobData, userId: string) => {
  // Validate stock selection limit
  if (data.selectedStocks.length > 50) {
    throw new Error('Cannot select more than 50 stocks');
  }

  // Validate that all selected stocks exist
  const validStocks = await prisma.stock.findMany({
    where: {
      id: {
        in: data.selectedStocks,
      },
    },
    select: {
      id: true,
    },
  });

  if (validStocks.length !== data.selectedStocks.length) {
    throw new Error('One or more selected stocks are invalid');
  }

  // Create the job
  const newJob = await prisma.job.create({
    data: {
      userId,
      name: data.name,
      analysisPrompt: data.analysisPrompt || null,
      runAtTime: data.runAtTime,
      isActive: true,
    },
  });

  // Create job-stock associations
  if (data.selectedStocks.length > 0) {
    await prisma.jobStock.createMany({
      data: data.selectedStocks.map((stockId) => ({
        jobId: newJob.id,
        stockId,
      })),
    });
  }

  return newJob;
};

export const updateJob = async (id: string, data: UpdateJobData) => {
  const updateData: Prisma.JobUpdateInput = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.analysisPrompt !== undefined)
    updateData.analysisPrompt = data.analysisPrompt;
  if (data.runAtTime !== undefined) updateData.runAtTime = data.runAtTime;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  updateData.updatedAt = new Date();

  const updatedJob = await prisma.job.updateMany({
    where: {
      id,
    },
    data: updateData,
  });

  if (updatedJob.count === 0) {
    throw new Error('Job not found');
  }

  return await prisma.job.findUnique({
    where: { id },
  });
};

export const deleteJob = async (id: string) => {
  // First delete all related jobStocks records
  await prisma.jobStock.deleteMany({
    where: { jobId: id },
  });

  // Then delete the job
  const deletedJob = await prisma.job.deleteMany({
    where: {
      id,
    },
  });

  if (deletedJob.count === 0) {
    throw new Error('Job not found');
  }

  return deletedJob;
};
