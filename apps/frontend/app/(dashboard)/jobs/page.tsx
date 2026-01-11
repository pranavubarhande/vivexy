'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2,
  Plus,
  Briefcase,
  Search,
  ChevronLeft,
  ChevronRight,
  Edit,
  Trash2,
  MoreHorizontal,
} from 'lucide-react';
import { Job } from '@prisma/client';
import {
  useJobs,
  useCreateJob,
  useUpdateJob,
  useDeleteJob,
} from '@/hooks/useJobs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useStocks } from '@/hooks/useStocks';

interface CreateJobForm {
  name: string;
  analysisPrompt: string;
  selectedStocks: string[];
  runAtTime: string;
}

interface EditJobForm {
  name: string;
  analysisPrompt: string;
  runAtTime: string;
  isActive: boolean;
}

export default function JobsPage() {
  const [formData, setFormData] = useState<CreateJobForm>({
    name: '',
    analysisPrompt: '',
    selectedStocks: [],
    runAtTime: '01:00',
  });

  // Edit job state
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [editFormData, setEditFormData] = useState<EditJobForm>({
    name: '',
    analysisPrompt: '',
    runAtTime: '01:00',
    isActive: true,
  });

  // Delete job state
  const [deletingJob, setDeletingJob] = useState<Job | null>(null);

  // Search and pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1); // Reset to first page when searching
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const {
    stocks,
    pagination,
    isLoading: stocksLoading,
  } = useStocks(debouncedSearchQuery, currentPage, 50);

  const { jobs, isLoading: jobsLoading, refetch: refetchJobs } = useJobs();

  const createJobMutation = useCreateJob();
  const updateJobMutation = useUpdateJob();
  const deleteJobMutation = useDeleteJob();

  const handleStockToggle = (stockId: string) => {
    setFormData((prev) => ({
      ...prev,
      selectedStocks: prev.selectedStocks.includes(stockId)
        ? prev.selectedStocks.filter((id) => id !== stockId)
        : [...prev.selectedStocks, stockId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.selectedStocks.length > 50) {
      toast('You can select a maximum of 50 stocks');
      return;
    }

    if (!formData.name.trim()) {
      toast('Job name is required');
      return;
    }

    try {
      await createJobMutation.mutateAsync({
        name: formData.name.trim(),
        analysisPrompt: formData.analysisPrompt.trim() || undefined,
        selectedStocks: formData.selectedStocks,
        runAtTime: formData.runAtTime,
      });

      setFormData({
        name: '',
        analysisPrompt: '',
        selectedStocks: [],
        runAtTime: '01:00',
      });
      refetchJobs();
    } catch {
      toast('Failed to create job');
    }
  };

  const handleEditJob = (job: Job) => {
    setEditingJob(job);
    setEditFormData({
      name: job.name,
      analysisPrompt: job.analysisPrompt || '',
      runAtTime: job.runAtTime,
      isActive: job.isActive,
    });
  };

  const handleCloseEditDialog = () => {
    setEditingJob(null);
  };

  const handleUpdateJob = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingJob) return;

    if (!editFormData.name.trim()) {
      toast('Job name is required');
      return;
    }

    try {
      await updateJobMutation.mutateAsync({
        id: editingJob.id,
        data: {
          name: editFormData.name.trim(),
          analysisPrompt: editFormData.analysisPrompt.trim() || undefined,
          runAtTime: editFormData.runAtTime,
          isActive: editFormData.isActive,
        },
      });

      handleCloseEditDialog();
      refetchJobs();
    } catch {
      toast('Failed to update job');
    }
  };

  const handleDeleteJob = (job: Job) => {
    setDeletingJob(job);
  };

  const handleCloseDeleteDialog = () => {
    setDeletingJob(null);
  };

  const handleConfirmDelete = async (jobId: string) => {
    try {
      await deleteJobMutation.mutateAsync(jobId);
      handleCloseDeleteDialog();
      refetchJobs();
    } catch {
      toast('Failed to delete job');
    }
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
        <p className="text-gray-600">
          Create and manage your portfolio analysis jobs
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create Job Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New Job
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="jobName">Job Name *</Label>
                <Input
                  id="jobName"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Enter job name"
                  required
                />
              </div>

              <div>
                <Label htmlFor="runTime">Run Time</Label>
                <Input
                  id="runTime"
                  type="time"
                  value={formData.runAtTime}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      runAtTime: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <Label>Analysis Prompt (Optional)</Label>
                <Textarea
                  value={formData.analysisPrompt}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      analysisPrompt: e.target.value,
                    }))
                  }
                  placeholder="Enter additional analysis instructions..."
                  rows={3}
                />
              </div>

              <div>
                <Label>Select Stocks (Max 50)</Label>

                {/* Search Input */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search stocks by symbol or name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <div className="mt-2 max-h-24 overflow-y-auto border rounded-md p-3 bg-gray-50">
                  {stocksLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Loading stocks...
                    </div>
                  ) : stocks.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                      {debouncedSearchQuery
                        ? 'No stocks found matching your search'
                        : 'No stocks available'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 overflow-hidden">
                      {stocks.map((stock) => (
                        <div
                          key={stock.id}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={`stock-${stock.id}`}
                            checked={formData.selectedStocks.includes(stock.id)}
                            onCheckedChange={() => handleStockToggle(stock.id)}
                          />
                          <Label
                            htmlFor={`stock-${stock.id}`}
                            className="text-sm font-normal cursor-pointer flex-1"
                          >
                            <span className="font-medium">{stock.symbol}</span>
                            <span className="text-gray-500 ml-2">
                              {stock.name}
                            </span>
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
                    <div>
                      Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                      {Math.min(
                        pagination.page * pagination.limit,
                        pagination.total
                      )}{' '}
                      of {pagination.total} stocks
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={!pagination.hasPrev}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="px-2">
                        {pagination.page} of {pagination.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.page + 1)}
                        disabled={!pagination.hasNext}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                <p className="text-sm text-gray-500 mt-1">
                  Selected: {formData.selectedStocks.length}/50 stocks
                </p>
              </div>

              <Button
                type="submit"
                disabled={
                  createJobMutation.isPending ||
                  formData.selectedStocks.length === 0
                }
                className="w-full"
              >
                {createJobMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Job...
                  </>
                ) : (
                  <>
                    <Briefcase className="mr-2 h-4 w-4" />
                    Create Job
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Existing Jobs */}
        <Card>
          <CardHeader>
            <CardTitle>Existing Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {jobsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : jobs?.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No jobs created yet
              </p>
            ) : (
              <div className="space-y-3">
                {jobs?.map((job) => (
                  <div key={job.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium">{job.name}</h3>
                        <p className="text-sm text-gray-500">
                          Runs at {job.runAtTime}
                        </p>
                        {job.analysisPrompt && (
                          <p className="text-xs text-gray-400 mt-1">
                            Custom prompt: {job.analysisPrompt.substring(0, 50)}
                            ...
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            job.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {job.isActive ? 'Active' : 'Inactive'}
                        </span>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleEditJob(job)}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteJob(job)}
                              className="text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Job Dialog */}
      <Dialog
        open={!!editingJob}
        onOpenChange={(open) => !open && handleCloseEditDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Job</DialogTitle>
            <DialogDescription>Update the job details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateJob}>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="editJobName">Job Name *</Label>
                <Input
                  id="editJobName"
                  value={editFormData.name}
                  onChange={(e) =>
                    setEditFormData((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  placeholder="Enter job name"
                  required
                />
              </div>

              <div>
                <Label htmlFor="editRunTime">Run Time</Label>
                <Input
                  id="editRunTime"
                  type="time"
                  value={editFormData.runAtTime}
                  onChange={(e) =>
                    setEditFormData((prev) => ({
                      ...prev,
                      runAtTime: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <Label htmlFor="editAnalysisPrompt">
                  Analysis Prompt (Optional)
                </Label>
                <Textarea
                  id="editAnalysisPrompt"
                  value={editFormData.analysisPrompt}
                  onChange={(e) =>
                    setEditFormData((prev) => ({
                      ...prev,
                      analysisPrompt: e.target.value,
                    }))
                  }
                  placeholder="Enter additional analysis instructions..."
                  rows={3}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="editIsActive"
                  checked={editFormData.isActive}
                  onCheckedChange={(checked: boolean) =>
                    setEditFormData((prev) => ({
                      ...prev,
                      isActive: !!checked,
                    }))
                  }
                />
                <Label htmlFor="editIsActive">Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseEditDialog}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateJobMutation.isPending}>
                {updateJobMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Job'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletingJob}
        onOpenChange={(open) => !open && handleCloseDeleteDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the job
              &quot;{deletingJob?.name}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCloseDeleteDialog}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingJob && handleConfirmDelete(deletingJob.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
