export type PromptFieldType = 'text' | 'long_text' | 'choice';
export type PromptSource = 'built_in' | 'team' | 'personal';
export type PromptVisibility = 'personal' | 'team';

export interface PromptField {
  key: string;
  label: string;
  type: PromptFieldType;
  required: boolean;
  options: string[];
  placeholder: string;
}

export interface SavedPrompt {
  id: string;
  source: PromptSource;
  title: string;
  description: string | null;
  category: string | null;
  body: string;
  fields: PromptField[];
  teamId: string | null;
  ownerId: string | null;
  canEdit: boolean;
  useCount: number;
  updatedAt: string | null;
}

export interface PromptList {
  prompts: SavedPrompt[];
  categories: string[];
  canManageTeamPrompts: boolean;
}

export interface PromptPayload {
  title: string;
  description?: string;
  category?: string;
  body: string;
  fields: PromptField[];
  visibility: PromptVisibility;
  teamId?: string | null;
}
