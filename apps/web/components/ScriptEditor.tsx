'use client';

import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, drawSelection, keymap, placeholder } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useEffect, useRef } from 'react';
import { extractScenes, type SceneSpan, type TextFormat } from '@epic/fountain';
import { fountain, hideMarkers } from '@epic/fountain/codemirror';

const theme = EditorView.theme({
  '&': { color: 'var(--ink)', backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': { caretColor: 'var(--ink)', padding: '0' },
  '.cm-cursor': { borderLeftColor: 'var(--ink)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--line)',
  },
});

const proseHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: [tags.processingInstruction, tags.meta, tags.comment], color: 'var(--faint)' },
]);

interface Props {
  initialText: string;
  format: TextFormat;
  onScenes: (scenes: SceneSpan[]) => void;
  onJumpHandler: (fn: ((pos: number) => void) | null) => void;
  onTyping?: () => void;
}

/**
 * CodeMirror editor for one document. It owns its text after mount: nothing on the keystroke path
 * touches React state, the network or the database (ED-8). The outline refreshes after a pause.
 */
export function ScriptEditor({ initialText, format, onScenes, onJumpHandler, onTyping }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onScenes, onTyping });
  callbacks.current = { onScenes, onTyping };

  useEffect(() => {
    let outlineTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshOutline = (text: string) =>
      callbacks.current.onScenes(extractScenes(text, format));

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
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.contentAttributes.of({
            'aria-label': format === 'fountain' ? 'Script' : 'Text',
            spellcheck: 'true',
          }),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            callbacks.current.onTyping?.();
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

    refreshOutline(initialText);
    onJumpHandler((pos) => {
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 48 }),
      });
      view.focus();
    });
    view.focus();
    // Development-only handle for the Playwright performance test.
    if (process.env.NODE_ENV !== 'production')
      (window as unknown as { __epicEditor?: EditorView }).__epicEditor = view;

    return () => {
      clearTimeout(outlineTimer);
      onJumpHandler(null);
      view.destroy();
    };
    // The editor is created once per document; the parent remounts it with a new key.
  }, []);

  return <div ref={host} className={format === 'fountain' ? 'script' : 'prose'} />;
}
