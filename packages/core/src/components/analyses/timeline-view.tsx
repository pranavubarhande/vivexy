'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Loader2, Search } from 'lucide-react';
import { Input } from '@vivexy/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vivexy/ui/select';
import { filterTimeline, timelinePeople } from '../../lib/analyses';
import type { Analysis } from '../../types/analysis';
import type { Citation } from '../../types/chat';
import { SourceChips } from './source-chips';

const EVERYONE = '__everyone__';

interface TimelineViewProps {
  analysis: Analysis;
  onOpenSource: (citation: Citation) => void;
}

export const TimelineView = ({ analysis, onOpenSource }: TimelineViewProps) => {
  const [filter, setFilter] = useState('');
  const [person, setPerson] = useState(EVERYONE);
  const events = useMemo(() => analysis.events ?? [], [analysis.events]);
  const people = useMemo(() => timelinePeople(events), [events]);
  const shown = useMemo(
    () => filterTimeline(events, filter, person === EVERYONE ? '' : person),
    [events, filter, person]
  );
  const pending = analysis.results.filter((r) => r.status === 'pending');
  const failed = analysis.results.filter((r) => r.status === 'failed');
  const filenames = new Map(
    analysis.documents.map((document) => [document.id, document.filename])
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter events"
            className="h-8 pl-8 text-sm"
          />
        </div>
        {people.length > 0 && (
          <Select value={person} onValueChange={setPerson}>
            <SelectTrigger className="h-8 w-56 text-sm">
              <SelectValue placeholder="Everyone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EVERYONE}>Everyone</SelectItem>
              {people.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <span className="text-xs text-muted-foreground">
          {shown.length} of {events.length} events
        </span>
      </div>

      {pending.length > 0 && (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Reading {pending.length} more document
          {pending.length === 1 ? '' : 's'}…
        </p>
      )}
      {failed.map((result) => (
        <p
          key={result.id}
          className="flex items-center gap-1.5 text-xs text-destructive"
        >
          <AlertCircle className="size-3" />
          {filenames.get(result.documentId)}: {result.error}
        </p>
      ))}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table data-testid="timeline-table" className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-left text-xs text-muted-foreground">
              <th className="w-40 px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Event</th>
              <th className="w-56 px-3 py-2 font-medium">People</th>
              <th className="w-56 px-3 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((event, index) => (
              <tr
                key={`${event.documentId}-${index}`}
                className="border-t border-border align-top"
              >
                <td className="px-3 py-2 text-[13px] font-medium whitespace-nowrap">
                  {event.date ?? event.sortDate ?? 'Undated'}
                </td>
                <td className="px-3 py-2 text-[13px]">{event.event}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {event.people.join(', ')}
                </td>
                <td className="px-3 py-2">
                  <SourceChips
                    citations={event.citations}
                    onOpen={onOpenSource}
                    showFilename
                  />
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  {events.length
                    ? 'No events match this filter.'
                    : pending.length
                      ? 'Events appear here as documents are read.'
                      : 'No dated events were found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
