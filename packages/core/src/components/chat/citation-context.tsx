'use client';

import { createContext, useContext } from 'react';
import type { Citation, CitationStatementCheck } from '../../types/chat';

export interface CitationContextValue {
  numbers: Map<string, number>;
  citationsById: Map<string, Citation>;
  statements: CitationStatementCheck[];
  openSource: (citation: Citation) => void;
}

export const CitationContext = createContext<CitationContextValue | null>(null);

export const useCitationContext = () => useContext(CitationContext);
