import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@vivexy/ui/alert-dialog';
import { Button } from '@vivexy/ui/button';
import { Badge } from '@vivexy/ui/badge';
import { useState } from 'react';
import { Loader2, ShieldAlert, FileText, Code2 } from 'lucide-react';

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

/** Maps tool names to human-readable labels and icons */
const TOOL_LABELS: Record<string, string> = {
  write_csv: 'Create CSV File',
  write_xlsx: 'Create Excel File',
  write_pdf: 'Create PDF Document',
  write_docx: 'Create Word Document',
  write_md: 'Create Markdown File',
  delete_file: 'Delete File',
};

export function ApprovalDialog({
  open,
  request,
  onApprove,
  onReject,
}: ApprovalDialogProps) {
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  if (!request) return null;

  const isProcessing = isApproving || isRejecting;
  const toolLabel = TOOL_LABELS[request.tool_name] ?? request.tool_name;

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await onApprove(request.request_id);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await onReject(request.request_id);
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    /* No onOpenChange — dialog is non-dismissable while pending */
    <AlertDialog open={open}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            <AlertDialogTitle>Approval Required</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            The agent wants to perform an action that requires your explicit
            approval before proceeding.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-3 my-1">
          {/* Action */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">
              Action:
            </span>
            <Badge variant="secondary" className="font-mono text-xs gap-1">
              <FileText className="h-3 w-3" />
              {toolLabel}
            </Badge>
          </div>

          {/* Description */}
          <div>
            <span className="text-sm font-semibold text-foreground">
              What will happen:
            </span>
            <p className="text-sm mt-1 text-muted-foreground leading-relaxed">
              {request.description}
            </p>
          </div>

          {/* Parameters */}
          {request.tool_input && Object.keys(request.tool_input).length > 0 && (
            <div>
              <div className="flex items-center gap-1 text-sm font-semibold text-foreground mb-1">
                <Code2 className="h-3.5 w-3.5" />
                Parameters:
              </div>
              <pre className="text-xs bg-background border rounded-md p-2.5 overflow-auto max-h-40 leading-relaxed whitespace-pre-wrap wrap-break-word">
                {JSON.stringify(request.tool_input, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Waiting indicator */}
        {isProcessing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Processing your decision…
          </div>
        )}

        <AlertDialogFooter className="sm:justify-between gap-2">
          <Button
            variant="outline"
            onClick={handleReject}
            disabled={isProcessing}
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {isRejecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reject
          </Button>
          <Button
            onClick={handleApprove}
            disabled={isProcessing}
            className="gap-2"
          >
            {isApproving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Approve & Continue
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
