'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { executeSandboxCode, killSandboxProcess, SandboxEvent } from '@/lib/api';
import './SandboxTab.css';

interface OutputLine {
  type: 'stdout' | 'stderr' | 'system';
  data: string;
  timestamp: number;
}

type SandboxStatus = 'idle' | 'running' | 'error' | 'killed';

const MAX_OUTPUT_LINES = 10000;
const DEFAULT_CODE = `console.log("Hello from Bun!");`;

interface SandboxTabProps {
  projectPath: string;
}

export default function SandboxTab({ projectPath }: SandboxTabProps) {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [status, setStatus] = useState<SandboxStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(13);
  const abortControllerRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const MIN_FONT_SIZE = 8;
  const MAX_FONT_SIZE = 32;
  const FONT_STEP = 2;

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const appendOutput = useCallback((line: OutputLine) => {
    setOutput(prev => {
      const next = [...prev, line];
      if (next.length > MAX_OUTPUT_LINES) {
        return next.slice(next.length - MAX_OUTPUT_LINES);
      }
      return next;
    });
  }, []);

  const handleRun = useCallback(async () => {
    if (status === 'running') return;
    if (!code.trim()) return;

    setStatus('running');
    setOutput([]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    appendOutput({
      type: 'system',
      data: 'Starting container...',
      timestamp: Date.now(),
    });

    try {
      const sid = await executeSandboxCode(
        { code, timeout: 30 },
        (event: SandboxEvent) => {
          if (event.type === 'exit') {
            const exitCode = event.data;
            appendOutput({
              type: 'system',
              data: `Process exited with code ${exitCode}`,
              timestamp: event.timestamp,
            });
            setStatus(exitCode === '0' ? 'idle' : 'error');
            setSessionId(null);
          } else {
            appendOutput({
              type: event.type as 'stdout' | 'stderr',
              data: event.data,
              timestamp: event.timestamp,
            });
          }
        },
        controller.signal
      );

      setSessionId(sid);
      appendOutput({
        type: 'system',
        data: `Container started (sandbox-${sid.slice(0, 8)}...)`,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return;
      }
      appendOutput({
        type: 'system',
        data: `Error: ${err.message || 'Failed to start container'}`,
        timestamp: Date.now(),
      });
      setStatus('error');
      setSessionId(null);
    }
  }, [code, status, appendOutput]);

  const handleKill = useCallback(async () => {
    if (!sessionId && status !== 'running') return;

    // Abort the fetch stream
    abortControllerRef.current?.abort();

    if (sessionId) {
      try {
        await killSandboxProcess(sessionId);
      } catch {
        // Container may already be gone
      }
    }

    appendOutput({
      type: 'system',
      data: 'Process killed by user',
      timestamp: Date.now(),
    });

    setStatus('killed');
    setSessionId(null);
  }, [sessionId, status, appendOutput]);

  const handleClear = useCallback(() => {
    setOutput([]);
  }, []);

  const handleZoomIn = useCallback(() => {
    setFontSize(prev => Math.min(prev + FONT_STEP, MAX_FONT_SIZE));
  }, []);

  const handleZoomOut = useCallback(() => {
    setFontSize(prev => Math.max(prev - FONT_STEP, MIN_FONT_SIZE));
  }, []);

  // Sync font size to editor instance
  useEffect(() => {
    editorRef.current?.updateOptions({ fontSize });
  }, [fontSize]);

  const statusLabel: Record<SandboxStatus, string> = {
    idle: 'Idle',
    running: 'Running',
    error: 'Error',
    killed: 'Killed',
  };

  return (
    <div className="sandbox">
      <div className="sandbox-toolbar">
        <div className="sandbox-toolbar-left">
          <button
            className="sandbox-btn sandbox-btn-run"
            onClick={handleRun}
            disabled={status === 'running' || !code.trim()}
          >
            &#9654; Run
          </button>
          <button
            className="sandbox-btn sandbox-btn-kill"
            onClick={handleKill}
            disabled={status !== 'running'}
          >
            &#9632; Kill
          </button>
          <button
            className="sandbox-btn sandbox-btn-clear"
            onClick={handleClear}
          >
            Clear
          </button>
          <span className="sandbox-toolbar-sep" />
          <button
            className="sandbox-btn sandbox-btn-zoom"
            onClick={handleZoomOut}
            disabled={fontSize <= MIN_FONT_SIZE}
            title="Zoom out"
          >
            A-
          </button>
          <span className="sandbox-font-size">{fontSize}px</span>
          <button
            className="sandbox-btn sandbox-btn-zoom"
            onClick={handleZoomIn}
            disabled={fontSize >= MAX_FONT_SIZE}
            title="Zoom in"
          >
            A+
          </button>
        </div>
        <div className="sandbox-toolbar-right">
          <span className={`sandbox-status-dot sandbox-status-${status}`} />
          <span className="sandbox-status-label">{statusLabel[status]}</span>
          <span className="sandbox-isolation-badge">Podman &bull; Air-gapped</span>
        </div>
      </div>

      <div className="sandbox-editor-panel">
        <Editor
          defaultLanguage="typescript"
          value={code}
          onChange={(value) => setCode(value || '')}
          onMount={(editor) => { editorRef.current = editor; }}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize,
            fontFamily: 'var(--font-mono, "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace)',
            wordWrap: 'on',
            tabSize: 2,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 12 },
          }}
        />
      </div>

      <div className="sandbox-output-panel">
        <div className="sandbox-output-header">
          <span>Output</span>
          <button className="sandbox-btn sandbox-btn-clear-sm" onClick={handleClear}>
            Clear
          </button>
        </div>
        <div className="sandbox-output-content" ref={outputRef}>
          {output.length === 0 ? (
            <div className="sandbox-output-placeholder">
              Run code to see output here
            </div>
          ) : (
            output.map((line, i) => (
              <div key={i} className={`sandbox-output-line sandbox-output-${line.type}`}>
                {line.type === 'system' ? `[system] ${line.data}` : `> ${line.data}`}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
