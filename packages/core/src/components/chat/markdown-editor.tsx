'use client';

import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  toolbarPlugin,
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  InsertTable,
  ListsToggle,
  UndoRedo,
  linkPlugin,
  tablePlugin,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';

interface MarkdownEditorProps {
  markdown: string;
  onChange: (markdown: string) => void;
}

export function MarkdownEditor({ markdown, onChange }: MarkdownEditorProps) {
  return (
    <div className="w-full h-full border rounded-lg overflow-hidden bg-background prose-sm">
      <MDXEditor
        markdown={markdown}
        onChange={onChange}
        className="h-full rich-text-editor custom-scrollbar"
        contentEditableClassName="outline-none min-h-[300px] max-w-none prose prose-slate p-4"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          tablePlugin(),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <div className="flex flex-wrap items-center gap-1 p-1 bg-muted/30 border-b">
                <UndoRedo />
                <div className="w-px h-4 bg-border mx-1" />
                <BlockTypeSelect />
                <div className="w-px h-4 bg-border mx-1" />
                <BoldItalicUnderlineToggles />
                <div className="w-px h-4 bg-border mx-1" />
                <ListsToggle />
                <div className="w-px h-4 bg-border mx-1" />
                <CreateLink />
                <InsertTable />
              </div>
            ),
          }),
        ]}
      />
    </div>
  );
}
