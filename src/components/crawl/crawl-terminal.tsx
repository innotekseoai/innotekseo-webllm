'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface TerminalLine {
  url: string;
  title?: string;
  charCount: number;
  index: number;
  analyzed?: boolean;
}

export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'detail';

export interface LogLine {
  id: string;
  level: LogLevel;
  message: string;
  timestamp?: number;
}

export type ConsoleLine =
  | { type: 'page'; data: TerminalLine }
  | { type: 'log'; data: LogLine };

interface CrawlTerminalProps {
  lines: ConsoleLine[];
  status: 'idle' | 'crawling' | 'analyzing' | 'completed' | 'failed';
  baseUrl: string;
  analyzedCount?: number;
  totalPages?: number;
}

const LOG_COLORS: Record<LogLevel, string> = {
  info: 'text-accent/70',
  success: 'text-accent3',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  detail: 'text-muted/60',
};

const LOG_PREFIXES: Record<LogLevel, string> = {
  info: 'ℹ',
  success: '✓',
  warn: '⚠',
  error: '✗',
  detail: '·',
};

export function CrawlTerminal({ lines, status, baseUrl, analyzedCount, totalPages }: CrawlTerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const isActive = ['crawling', 'analyzing'].includes(status);
  const pageCount = lines.filter((l) => l.type === 'page').length;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length, status]);

  const hostname = (() => {
    try { return new URL(baseUrl).hostname; } catch { return baseUrl; }
  })();

  const statusLines: Record<string, string> = {
    crawling: 'Scanning next page...',
    analyzing: analyzedCount !== undefined && totalPages
      ? `Analyzing ${analyzedCount} / ${totalPages} pages...`
      : `Running GEO analysis on ${pageCount} page${pageCount !== 1 ? 's' : ''}...`,
  };
  const statusLine = statusLines[status] ?? '';

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-[#0a0e17] shadow-lg font-mono text-xs">

      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-surface2 border-b border-border select-none">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/70" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
          <div className="w-3 h-3 rounded-full bg-green-500/70" />
        </div>
        <span className="ml-2 text-muted">
          crawler — {hostname}
        </span>
        {isActive && (
          <motion.span
            className="ml-auto text-accent3"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            ● LIVE
          </motion.span>
        )}
        {!isActive && pageCount > 0 && (
          <span className="ml-auto text-muted">
            {pageCount} page{pageCount !== 1 ? 's' : ''} indexed
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-4 max-h-[32rem] overflow-y-auto space-y-0.5 leading-relaxed">

        {/* Init command */}
        <div className="text-muted/60 mb-2">
          $ geo-crawler --url {baseUrl} --limit 50
        </div>

        {/* Mixed page + log lines */}
        <AnimatePresence initial={false}>
          {lines.map((line, idx) => {
            if (line.type === 'log') {
              // Add separator before analysis phase
              const isPhaseStart = line.data.message.startsWith('Starting GEO analysis') ||
                line.data.message.startsWith('Resuming crawl') ||
                line.data.message.startsWith('Aggregating results');
              return (
                <motion.div
                  key={line.data.id}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className={isPhaseStart ? 'mt-2' : ''}
                >
                  {isPhaseStart && (
                    <div className="border-t border-border/20 mb-1.5" />
                  )}
                  <div className={`flex items-start gap-2 min-w-0 ${LOG_COLORS[line.data.level]}`}>
                    <span className="flex-shrink-0">{LOG_PREFIXES[line.data.level]}</span>
                    <span className="break-words flex-1">{line.data.message}</span>
                  </div>
                </motion.div>
              );
            }

            // Page line
            const page = line.data;
            const isAnalyzingPhase = status === 'analyzing';
            const isPageAnalyzed = isAnalyzingPhase && analyzedCount !== undefined && idx < (analyzedCount + lines.filter((l, i) => i <= idx && l.type === 'log').length);
            const pageIdx = lines.slice(0, idx + 1).filter((l) => l.type === 'page').length - 1;
            const analyzed = isAnalyzingPhase && analyzedCount !== undefined && pageIdx < analyzedCount;
            const pending = isAnalyzingPhase && (analyzedCount === undefined || pageIdx >= analyzedCount);

            return (
              <motion.div
                key={`page-${page.index}`}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="flex items-center gap-2 min-w-0"
              >
                {analyzed ? (
                  <span className="text-accent2 flex-shrink-0">✦</span>
                ) : pending ? (
                  <span className="text-muted/40 flex-shrink-0">○</span>
                ) : (
                  <span className="text-accent3 flex-shrink-0">✓</span>
                )}

                <motion.a
                  href={page.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`truncate flex-1 min-w-0 hover:underline ${
                    pending ? 'text-muted/40' : analyzed ? 'text-accent2/80' : 'text-accent'
                  }`}
                  initial={{ clipPath: 'inset(0 100% 0 0)' }}
                  animate={{ clipPath: 'inset(0 0% 0 0)' }}
                  transition={{ duration: 0.45, ease: 'linear' }}
                >
                  {page.url}
                </motion.a>

                {page.title && (
                  <span className="text-muted/50 flex-shrink-0 hidden sm:inline truncate max-w-32">
                    {page.title}
                  </span>
                )}

                <span className="text-accent3/60 flex-shrink-0 pl-1 tabular-nums">
                  {(page.charCount / 1000).toFixed(1)}k
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Active cursor line */}
        {isActive && statusLine && (
          <motion.div
            key="cursor-line"
            className="flex items-center gap-2 text-accent pt-0.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <span className="flex-shrink-0">›</span>
            <span className="text-muted">{statusLine}</span>
            <BlinkingCursor />
          </motion.div>
        )}

        {/* Empty active state */}
        {lines.length === 0 && isActive && (
          <div className="flex items-center gap-2 text-muted">
            <span>›</span>
            <span>Initialising crawler...</span>
            <BlinkingCursor />
          </div>
        )}

        {/* Done */}
        {status === 'completed' && pageCount > 0 && (
          <motion.div
            key="done-line"
            className="text-accent3 pt-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            ✓ Done — {pageCount} page{pageCount !== 1 ? 's' : ''} processed
          </motion.div>
        )}

        {/* Failed */}
        {status === 'failed' && (
          <motion.div
            key="fail-line"
            className="text-red-400 pt-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            ✗ Crawl failed
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function BlinkingCursor() {
  return (
    <motion.span
      className="inline-block w-1.5 h-3.5 bg-accent flex-shrink-0 align-middle"
      animate={{ opacity: [1, 1, 0, 0] }}
      transition={{
        duration: 1.1,
        times: [0, 0.49, 0.5, 1],
        repeat: Infinity,
        ease: 'linear',
      }}
    />
  );
}
