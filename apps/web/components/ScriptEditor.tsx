'use client';

import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, Prec, Transaction } from '@codemirror/state';
import { EditorView, drawSelection, keymap, placeholder } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useEffect, useRef } from 'react';
import {
  extractScenes,
  findMarkers,
  type SceneSpan,
  type TextEdit,
  type TextFormat,
} from '@epic/fountain';
import { fountain, hideMarkers } from '@epic/fountain/codemirror';
import { mentionCompletions, type MentionCandidate } from '@epic/fountain/mentions';
import { issueUnderlines, setUnderlines, type Underline } from '../lib/issue-underlines';

const theme = EditorView.theme({
  '&': { color: 'var(--ink)', backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': { caretColor: 'var(--ink)', padding: '0' },
  '.cm-cursor': { borderLeftColor: 'var(--ink)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--line)',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--panel)',
    color: 'var(--ink)',
    border: 'none',
    borderRadius: '0.75rem',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete > ul > li': {
    padding: '0.25rem 0.75rem',
    fontFamily: 'var(--type-ui)',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--selected)',
    color: 'var(--on-selected)',
  },
  '.cm-completionDetail': { marginLeft: '0.75rem', fontStyle: 'normal', opacity: '0.7' },
});

const proseHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: [tags.processingInstruction, tags.meta, tags.comment], color: 'var(--faint)' },
]);

/** A scene in the outline, with the entries mentioned in it (ED-7). */
export type OutlineScene = SceneSpan & { entityKeys: string[] };

export interface TextSelection {
  from: number;
  to: number;
  text: string;
}

/** What the page can do to the editor without owning its text. */
export interface EditorHandle {
  getText(): string;
  /** Replaces all text (restore, conflict resolution). Undoable. */
  replaceText(text: string): void;
  /** Replaces one range (e.g. a selection turned into a mention). Undoable. */
  replaceRange(from: number, to: number, text: string): void;
  /** Applies bookkeeping edits such as scene key markers, outside undo history. */
  applyEdits(edits: TextEdit[]): void;
  /** Shows continuity issues as underlines (AI-7). */
  setUnderlines(underlines: Underline[]): void;
}

interface Props {
  initialText: string;
  format: TextFormat;
  onScenes: (scenes: OutlineScene[]) => void;
  onJumpHandler: (fn: ((pos: number) => void) | null) => void;
  onTyping?: () => void;
  /** Called on every text change; must stay cheap (it runs on the keystroke path). */
  onChange?: () => void;
  onReady?: (handle: EditorHandle | null) => void;
  /** Entries to offer for mentions; read when autocomplete opens, so it never re-creates the editor. */
  getCandidates?: () => MentionCandidate[];
  onMentionClick?: (key: string, rect: DOMRect) => void;
  /** A non-empty selection, or null when it collapses. Not called while the selection stays empty. */
  onSelection?: (sel: TextSelection | null) => void;
  /** Opens with the cursor at this scene (links from an entry's appearances). */
  initialSceneKey?: string;
}

function outline(text: string, format: TextFormat): OutlineScene[] {
  return extractScenes(text, format).map((s) => ({
    ...s,
    entityKeys: [
      ...new Set(
        findMarkers(text.slice(s.from, s.to)).flatMap((m) =>
          m.kind === 'mention' && m.key ? [m.key] : [],
        ),
      ),
    ],
  }));
}

/**
 * CodeMirror editor for one document. It owns its text after mount: nothing on the keystroke path
 * touches React state, the network or the database (ED-8). The outline refreshes after a pause.
 */
export function ScriptEditor(props: Props) {
  const { initialText, format } = props;
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef(props);
  callbacks.current = props;

  useEffect(() => {
    let outlineTimer: ReturnType<typeof setTimeout> | undefined;
    let hadSelection = false;
    const refreshOutline = (text: string) => callbacks.current.onScenes(outline(text, format));

    const proseLanguage = new Compartment();
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initialText,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          theme,
          placeholder(format === 'fountain' ? 'INT. SOMEWHERE - DAY' : 'Begin the chapter…'),
          format === 'fountain'
            ? fountain()
            : [proseLanguage.of([]), syntaxHighlighting(proseHighlight), hideMarkers],
          issueUnderlines,
          autocompletion({
            override: [mentionCompletions(() => callbacks.current.getCandidates?.() ?? [], format)],
            defaultKeymap: false,
            icons: false,
          }),
          // While suggestions are open, Enter accepts one instead of the screenplay Enter.
          Prec.highest(keymap.of(completionKeymap)),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.contentAttributes.of({
            'aria-label': format === 'fountain' ? 'Script' : 'Text',
            spellcheck: 'true',
          }),
          EditorView.updateListener.of((u) => {
            if (u.selectionSet || u.docChanged) {
              const { from, to } = u.state.selection.main;
              if (from !== to) {
                hadSelection = true;
                callbacks.current.onSelection?.({ from, to, text: u.state.sliceDoc(from, to) });
              } else if (hadSelection) {
                hadSelection = false;
                callbacks.current.onSelection?.(null);
              }
            }
            if (!u.docChanged) return;
            callbacks.current.onTyping?.();
            callbacks.current.onChange?.();
            clearTimeout(outlineTimer);
            outlineTimer = setTimeout(() => refreshOutline(u.state.doc.toString()), 300);
          }),
        ],
      }),
    });

    // Markdown support loads only for prose. Keeping it out of the main bundle also avoids a
    // Turbopack dev bug where it made the shared entry chunk restart and reload the page forever.
    if (format === 'markdown') {
      void import('@codemirror/lang-markdown').then(({ markdown }) => {
        if (!view.dom.isConnected) return;
        view.dispatch({ effects: proseLanguage.reconfigure(markdown()) });
      });
    }

    // Mentions are widgets CodeMirror ignores clicks on, so catch them on the host.
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.cm-mention');
      if (el?.dataset.entryKey)
        callbacks.current.onMentionClick?.(el.dataset.entryKey, el.getBoundingClientRect());
    };
    host.current!.addEventListener('click', onClick);

    refreshOutline(initialText);
    callbacks.current.onReady?.({
      getText: () => view.state.doc.toString(),
      replaceText: (text) =>
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }),
      replaceRange: (from, to, text) =>
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        }),
      applyEdits: (edits) =>
        view.dispatch({ changes: edits, annotations: Transaction.addToHistory.of(false) }),
      setUnderlines: (u) => view.dispatch({ effects: setUnderlines.of(u) }),
    });
    callbacks.current.onJumpHandler((pos) => {
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 48 }),
      });
      view.focus();
    });
    // Each editor instance places itself, so React's development double-mount can't lose the jump.
    const start =
      props.initialSceneKey &&
      extractScenes(initialText, format).find((s) => s.key === props.initialSceneKey);
    if (start)
      view.dispatch({
        selection: { anchor: start.from },
        effects: EditorView.scrollIntoView(start.from, { y: 'start', yMargin: 48 }),
      });
    view.focus();
    // Development-only handle for the Playwright performance test.
    if (process.env.NODE_ENV !== 'production')
      (window as unknown as { __epicEditor?: EditorView }).__epicEditor = view;

    const el = host.current!;
    return () => {
      clearTimeout(outlineTimer);
      el.removeEventListener('click', onClick);
      callbacks.current.onJumpHandler(null);
      callbacks.current.onReady?.(null);
      view.destroy();
    };
    // The editor is created once per document; the parent remounts it with a new key.
  }, []);

  return <div ref={host} className={format === 'fountain' ? 'script' : 'prose'} />;
}
