import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export interface ApprovalRequest {
  request_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  description: string;
}

interface ApprovalDialogProps {
  open: boolean;
  request: ApprovalRequest | null;
  onApprove: (requestId: string) => Promise<void>;
  onReject: (requestId: string) => Promise<void>;
}

export function ApprovalDialog({
  open,
  request,
  onApprove,
  onReject,
}: ApprovalDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  if (!request) return null;

  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      await onApprove(request.request_id);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    try {
      await onReject(request.request_id);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Approval Required</AlertDialogTitle>
          <AlertDialogDescription>
            The agent wants to execute an action that requires your approval.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="bg-muted/50 p-4 rounded-md space-y-3 my-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Action:</span>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded border">
              {request.tool_name}
            </code>
          </div>

          <div>
            <span className="font-semibold text-sm">Description:</span>
            <p className="text-sm mt-1 text-muted-foreground">
              {request.description}
            </p>
          </div>

          {request.tool_input && Object.keys(request.tool_input).length > 0 && (
            <div>
              <span className="font-semibold text-sm">Parameters:</span>
              <pre className="text-xs mt-1 bg-muted p-2 rounded overflow-auto max-h-32">
                {JSON.stringify(request.tool_input, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <AlertDialogFooter className="sm:justify-between gap-2">
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={isProcessing}
          >
            Reject
          </Button>
          <Button onClick={handleApprove} disabled={isProcessing}>
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Approve
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
