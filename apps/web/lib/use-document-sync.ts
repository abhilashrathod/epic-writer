'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { sceneKeyEdits, type TextFormat } from '@epic/fountain';
import type { SaveConflictDto } from '@epic/schemas/api';
import type { EditorHandle } from '../components/ScriptEditor';
import { api, ApiError } from './api-client';

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'offline' | 'conflict';

/** Saves this long after typing pauses... */
const DEBOUNCE_MS = 1_500;
/** ...but never later than this after the first unsaved change. */
const MAX_WAIT_MS = 10_000;
const BUFFER_MS = 500;
const RETRY_MS = [2_000, 5_000, 15_000, 30_000];

interface Buffered {
  text: string;
  baseVersion: number;
}

const bufferKey = (projectId: string, documentKey: string) =>
  `epic:buffer:${projectId}:${documentKey}`;

// Local storage can be full or blocked; the buffer is a safety net, never a reason to fail.
function readBuffer(key: string): Buffered | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Buffered) : null;
  } catch {
    return null;
  }
}
function writeBuffer(key: string, value: Buffered | null) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Keeps one open document in sync with the server (ED-9): debounced autosave with optimistic
 * versions, a local buffer so nothing typed is lost offline, retries, and conflict resolution
 * that snapshots whichever side is replaced. Nothing here runs on the keystroke path except
 * `onChange`, which only flips flags and (re)arms timers.
 */
export function useDocumentSync(opts: {
  projectId: string;
  documentKey: string;
  format: TextFormat;
  initial: { text: string; version: number };
}) {
  const { projectId, documentKey, format } = opts;
  const base = `/api/projects/${projectId}/documents/${documentKey}`;
  const key = bufferKey(projectId, documentKey);

  const [status, setStatus] = useState<SaveStatus>('saved');
  const [conflict, setConflict] = useState<SaveConflictDto['current'] | null>(null);

  const editor = useRef<EditorHandle | null>(null);
  const version = useRef(opts.initial.version);
  const dirtySince = useRef<number | null>(null);
  const applying = useRef(false);
  const inflight = useRef<Promise<boolean> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const bufferTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const retries = useRef(0);
  const conflictRef = useRef(conflict);
  conflictRef.current = conflict;

  const flushBuffer = useCallback(() => {
    clearTimeout(bufferTimer.current);
    if (dirtySince.current !== null && editor.current) {
      writeBuffer(key, { text: editor.current.getText(), baseVersion: version.current });
    }
  }, [key]);

  /** Saves now. Resolves true when the server has everything typed so far. */
  const save = useCallback((): Promise<boolean> => {
    clearTimeout(saveTimer.current);
    if (inflight.current) return inflight.current.then(() => save());
    const ed = editor.current;
    if (!ed || conflictRef.current || dirtySince.current === null)
      return Promise.resolve(dirtySince.current === null);

    // Give new scenes their identity markers before the text leaves the editor.
    const edits = sceneKeyEdits(ed.getText(), format, uuidv7);
    if (edits.length) {
      applying.current = true;
      ed.applyEdits(edits);
      applying.current = false;
    }
    const text = ed.getText();
    setStatus('saving');

    const run = async (): Promise<boolean> => {
      try {
        const res = await api<{ version: number }>(`${base}/text`, {
          method: 'PUT',
          body: { text, baseVersion: version.current },
          keepalive: text.length < 60_000,
        });
        version.current = res.version;
        retries.current = 0;
        if (editor.current?.getText() === text) {
          dirtySince.current = null;
          writeBuffer(key, null);
          setStatus('saved');
          return true;
        }
        schedule(); // typed during the save
        return false;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setConflict((err.body as SaveConflictDto).current);
          setStatus('conflict');
          return false;
        }
        flushBuffer();
        setStatus('offline');
        const wait = RETRY_MS[Math.min(retries.current++, RETRY_MS.length - 1)]!;
        saveTimer.current = setTimeout(() => void save(), wait);
        return false;
      } finally {
        inflight.current = null;
      }
    };
    inflight.current = run();
    return inflight.current;
    // `schedule` (declared below) is only called later, once both exist.
  }, [base, format, key, flushBuffer]);

  const schedule = useCallback(() => {
    clearTimeout(saveTimer.current);
    const since = dirtySince.current ?? Date.now();
    const delay = Math.max(0, Math.min(DEBOUNCE_MS, MAX_WAIT_MS - (Date.now() - since)));
    saveTimer.current = setTimeout(() => void save(), delay);
  }, [save]);

  const onChange = useCallback(() => {
    if (applying.current) return;
    if (dirtySince.current === null) {
      dirtySince.current = Date.now();
      setStatus((s) => (s === 'conflict' || s === 'offline' ? s : 'unsaved'));
    }
    clearTimeout(bufferTimer.current);
    bufferTimer.current = setTimeout(flushBuffer, BUFFER_MS);
    if (!conflictRef.current) schedule();
  }, [flushBuffer, schedule]);

  /** Called once the editor exists: recovers text buffered on this device that never reached the server. */
  const onReady = useCallback(
    (handle: EditorHandle | null) => {
      if (!handle) {
        // The editor is going away (navigation): keep the buffer current and send what's unsaved.
        flushBuffer();
        if (dirtySince.current !== null) void save();
        editor.current = null;
        return;
      }
      editor.current = handle;
      const buffered = readBuffer(key);
      if (!buffered || buffered.text === opts.initial.text) {
        writeBuffer(key, null);
        return;
      }
      applying.current = true;
      handle.replaceText(buffered.text);
      applying.current = false;
      dirtySince.current = Date.now();
      if (buffered.baseVersion === opts.initial.version) {
        setStatus('unsaved');
        schedule();
      } else {
        // The server moved on while this device held unsaved text.
        setConflict({ text: opts.initial.text, version: opts.initial.version });
        setStatus('conflict');
      }
    },
    // Runs once per document mount with the text it was loaded with.
    [key],
  );

  /** Keep this device's text; the other device's text is snapshotted first. */
  const keepMine = useCallback(async () => {
    if (!conflict) return;
    await api(`${base}/versions`, {
      method: 'POST',
      body: { label: 'Replaced by text from another device' },
    });
    version.current = conflict.version;
    setConflict(null);
    conflictRef.current = null;
    dirtySince.current ??= Date.now();
    await save();
  }, [base, conflict, save]);

  /** Take the other device's text; this device's unsaved text is snapshotted first. */
  const takeTheirs = useCallback(async () => {
    if (!conflict || !editor.current) return;
    await api(`${base}/versions`, {
      method: 'POST',
      body: { label: 'Unsaved text from this device', text: editor.current.getText() },
    });
    applying.current = true;
    editor.current.replaceText(conflict.text);
    applying.current = false;
    version.current = conflict.version;
    dirtySince.current = null;
    writeBuffer(key, null);
    setConflict(null);
    setStatus('saved');
  }, [base, conflict, key]);

  /** Replaces the text with a restored version (the server already saved it). */
  const applyRestored = useCallback(
    (restored: { text: string; version: number }) => {
      if (!editor.current) return;
      applying.current = true;
      editor.current.replaceText(restored.text);
      applying.current = false;
      version.current = restored.version;
      dirtySince.current = null;
      writeBuffer(key, null);
      setStatus('saved');
    },
    [key],
  );

  // Retry as soon as the connection returns; keep the buffer current when the tab goes away.
  useEffect(() => {
    const online = () => dirtySince.current !== null && void save();
    const hide = () => {
      flushBuffer();
      if (dirtySince.current !== null) void save();
    };
    // On unmount the editor's own cleanup (onReady(null)) has already flushed and saved.
    window.addEventListener('online', online);
    window.addEventListener('pagehide', hide);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('pagehide', hide);
      clearTimeout(saveTimer.current);
    };
  }, [save, flushBuffer]);

  return {
    status,
    conflict,
    onChange,
    onReady,
    save,
    keepMine,
    takeTheirs,
    applyRestored,
    baseVersion: () => version.current,
  };
}
