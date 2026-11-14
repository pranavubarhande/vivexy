'use client';

import { ChangeEvent, Suspense, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Plus, Table2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@vivexy/ui/button';
import { EmptyState, PageContainer, PageHeader } from '@vivexy/ui/page-header';
import { AnalysisDetail } from '@vivexy/core/analyses/analysis-detail';
import { AnalysisList } from '@vivexy/core/analyses/analysis-list';
import { NewAnalysisDialog } from '@vivexy/core/analyses/new-analysis-dialog';
import { useActiveTeam } from '@vivexy/core/hooks/useActiveTeam';
import { useAnalyses } from '@vivexy/core/hooks/useAnalyses';
import {
  useScopeDocuments,
  useUploadDocuments,
} from '@vivexy/core/hooks/useDocuments';
import { getApiErrorMessage } from '@vivexy/core/lib/admin-format';
import type {
  AnalysisKind,
  AnalysisQuestionInput,
  AnalysisScope,
} from '@vivexy/core/types/analysis';

const ANALYSIS_PARAM = 'analysis';

export interface DocumentAnalysesScreenProps {
  /** Documents and analyses of this scope. Defaults to the active team. */
  scope?: AnalysisScope;
  eyebrow?: string;
  title?: string;
  description?: string;
  /** Suggested review questions shown as one-click chips. */
  questionPresets?: AnalysisQuestionInput[];
  /** Kinds this screen lists; all three by default. */
  kind?: AnalysisKind;
  allowUpload?: boolean;
}

export const DocumentAnalysesScreen = ({
  scope,
  eyebrow = 'Documents',
  title = 'Document analyses',
  description = 'Review many documents at once, summarize them or build a timeline. Every answer links to its source.',
  questionPresets,
  kind,
  allowUpload = true,
}: DocumentAnalysesScreenProps) => {
  const { activeTeamId } = useActiveTeam();
  const effectiveScope: AnalysisScope = scope ?? { teamId: activeTeamId };
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get(ANALYSIS_PARAM);
  const [dialogOpen, setDialogOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const { data: analyses = [], isLoading } = useAnalyses(effectiveScope, kind);
  const { data: documentList } = useScopeDocuments(effectiveScope);
  const upload = useUploadDocuments(effectiveScope);
  const documents = documentList?.documents ?? [];
  const processing = documents.filter(
    (document) =>
      document.status === 'queued' || document.status === 'processing'
  ).length;

  const openAnalysis = (analysisId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (analysisId) params.set(ANALYSIS_PARAM, analysisId);
    else params.delete(ANALYSIS_PARAM);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    upload.mutate(files, {
      onSuccess: (uploaded) =>
        toast.success(
          `Uploaded ${uploaded.length} document${uploaded.length === 1 ? '' : 's'}. They will be ready in a moment.`
        ),
      onError: (error) =>
        toast.error(getApiErrorMessage(error, 'Upload failed')),
    });
  };

  if (selectedId) {
    return (
      <PageContainer size="wide" className="max-w-none">
        <AnalysisDetail
          analysisId={selectedId}
          onBack={() => openAnalysis(null)}
        />
      </PageContainer>
    );
  }

  const newButton = (
    <Button onClick={() => setDialogOpen(true)}>
      <Plus className="size-4" />
      New analysis
    </Button>
  );

  return (
    <PageContainer size="wide">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <div className="flex gap-2">
            {allowUpload && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  hidden
                  accept=".pdf,.docx,.txt,.md,.eml,.zip"
                  onChange={handleFiles}
                  data-testid="analysis-upload-input"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInput.current?.click()}
                  disabled={upload.isPending}
                >
                  {upload.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  Upload documents
                </Button>
              </>
            )}
            {newButton}
          </div>
        }
      />
      <p className="mb-3 text-xs text-muted-foreground">
        {documents.length} document{documents.length === 1 ? '' : 's'}
        {processing > 0 && ` · ${processing} still processing`}
      </p>
      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      ) : analyses.length === 0 ? (
        <EmptyState
          icon={<Table2 />}
          title="No analyses yet"
          description="Choose documents and ask the same questions of each, or summarize them, or pull out a timeline."
          action={newButton}
        />
      ) : (
        <AnalysisList analyses={analyses} onOpen={openAnalysis} />
      )}
      <NewAnalysisDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        scope={effectiveScope}
        documents={documents}
        initialKind={kind}
        lockKind={!!kind}
        questionPresets={questionPresets}
        onCreated={(analysis) => openAnalysis(analysis.id)}
      />
    </PageContainer>
  );
};

export default function DocumentAnalysesPage() {
  return (
    <Suspense>
      <DocumentAnalysesScreen />
    </Suspense>
  );
}
