'use client';

import * as Popover from '@radix-ui/react-popover';
import type { ReactNode } from 'react';
import type { TextFormat } from '@epic/fountain';
import { Button } from '@epic/ui';

type Row = [keys: ReactNode, what: string];

const SCRIPT: Row[] = [
  ['Tab', 'Change the line: action → character → scene heading → transition'],
  ['Tab on an empty dialogue line', 'Add a parenthetical'],
  ['Enter after a scene heading', 'Start the next line with a blank line'],
  ['Enter after a character', 'Go straight to dialogue'],
];

const DETECTED: Row[] = [
  ['INT. / EXT. / EST. / I/E', 'Scene heading'],
  ['CAPS line before text', 'Character (after a blank line)'],
  ['CAPS line ending TO:', 'Transition'],
  ['(text) under a character', 'Parenthetical'],
];

const FORCE: Row[] = [
  ['.', 'Scene heading'],
  ['@', 'Character'],
  ['!', 'Action'],
  ['>', 'Transition'],
  ['>text<', 'Centered'],
  ['~', 'Lyrics'],
  ['#', 'Section'],
  ['=', 'Synopsis'],
  ['[[note]]', 'Note (not printed)'],
  ['===', 'Page break'],
];

const CODEX: Row[] = [
  ['@Name or [[Name', 'Mention a codex entry (pick from the list)'],
  ['Click a mention', 'Open its codex card'],
  ['Select a name', 'Add to codex appears in the top bar'],
];

const GENERAL: Row[] = [
  ['⌘/Ctrl Z', 'Undo'],
  ['⌘/Ctrl Shift Z', 'Redo'],
  ['↑ ↓ Enter in a list', 'Pick a suggestion; Esc closes it'],
  ['Esc in focus mode', 'Close the open panel, then leave focus mode'],
];

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-medium uppercase tracking-wide text-faint">{title}</h3>
      <dl className="grid grid-cols-[minmax(0,11rem)_1fr] gap-x-3 gap-y-1 text-sm">
        {rows.map(([k, what], i) => (
          <div key={i} className="contents">
            <dt>
              <kbd className="rounded bg-sunk px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
            </dt>
            <dd className="text-muted">{what}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Shortcuts and features of the editor, opened from the top bar (keys like Tab aren't discoverable). */
export function EditorHelp({ format }: { format: TextFormat }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button aria-label="Editor shortcuts and help">?</Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-label="Editor shortcuts"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 flex max-h-[80vh] w-120 max-w-[calc(100vw-1.5rem)] flex-col gap-4 overflow-y-auto rounded-xl bg-panel p-4 text-ink shadow-lg"
        >
          <h2 className="text-sm font-semibold">Editor shortcuts</h2>
          {format === 'fountain' && (
            <>
              <Section title="Writing a script" rows={SCRIPT} />
              <Section title="Detected as you type" rows={DETECTED} />
              <Section title="Start a line with… to force it" rows={FORCE} />
            </>
          )}
          <Section title="Codex" rows={CODEX} />
          <Section title="General" rows={GENERAL} />
          <p className="text-xs text-faint">Your writing saves on its own as you type.</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
