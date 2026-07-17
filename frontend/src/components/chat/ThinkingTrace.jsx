import React, { useState } from 'react';
import { Brain, ChevronDown, ChevronRight, Check, Loader2 } from 'lucide-react';

export function ThinkingTrace({ steps = [], stepsComplete = false, thinkingDurationMs = null }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // If we are finished thinking and have no steps, don't show anything (zero status event case)
  if (stepsComplete && (!steps || steps.length === 0)) {
    return null;
  }

  // If thinking is NOT complete and we have no steps, show a default "Thinking..." step to avoid empty UI
  const displaySteps = steps && steps.length > 0
    ? steps
    : [{ id: 'default-thinking-step', text: 'Thinking' }];

  // Active thinking list (shows directly when stepsComplete is false)
  if (!stepsComplete) {
    return (
      <div className="my-2 pl-3 border-l-2 border-slate-200/80 dark:border-slate-700/80 flex flex-col gap-2 animate-[fadeIn_0.3s_ease-out]">
        {displaySteps.map((step, idx) => {
          const isLast = idx === displaySteps.length - 1;
          return (
            <div
              key={step.id}
              className={`flex items-center gap-2 text-xs transition-opacity duration-200 ${
                isLast
                  ? 'text-slate-700 dark:text-slate-300 font-medium'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {isLast ? (
                <Loader2 size={13} className="animate-spin text-blue-500 shrink-0" />
              ) : (
                <Check size={13} className="text-emerald-500 shrink-0" />
              )}
              <span>{step.text}</span>
            </div>
          );
        })}
      </div>
    );
  }

  // Collapsed thought pill once complete
  const durationSeconds = Math.max(0, Math.round((thinkingDurationMs || 0) / 1000));

  return (
    <div className="my-1.5">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 cursor-pointer transition-colors duration-150 select-none outline-none"
      >
        <Brain size={13} className="text-slate-400 dark:text-slate-500 shrink-0" />
        <span>Generated in {durationSeconds}s</span>
        {isExpanded ? (
          <ChevronDown size={13} className="text-slate-400 dark:text-slate-500 shrink-0" />
        ) : (
          <ChevronRight size={13} className="text-slate-400 dark:text-slate-500 shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 pl-3 border-l-2 border-slate-200/80 dark:border-slate-700/80 flex flex-col gap-2 animate-[fadeIn_0.2s_ease-out]">
          {displaySteps.map((step) => (
            <div key={step.id} className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
              <Check size={13} className="text-emerald-500 shrink-0" />
              <span>{step.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
