"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface AnswerStreamProps {
  content: string;
  isStreaming: boolean;
}

const CITATION_RE = /\[(\d+)\]/g;

function injectCitations(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = CITATION_RE.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    parts.push(
      <sup key={match.index} className="text-primary font-bold text-[10px]">
        [{match[1]}]
      </sup>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts;
}

const MD_COMPONENTS: Components = {
  p({ children }) {
    if (typeof children === "string") {
      return <p>{injectCitations(children)}</p>;
    }
    return <p>{children}</p>;
  },
  li({ children }) {
    if (typeof children === "string") {
      return <li>{injectCitations(children)}</li>;
    }
    return <li>{children}</li>;
  },
};

const REMARK_PLUGINS = [remarkGfm];

export function AnswerStream({ content, isStreaming }: AnswerStreamProps) {
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [content]);

  if (!content && !isStreaming) return null;

  return (
    <div className="relative">
      <div className="prose prose-sm dark:prose-invert max-w-none break-words text-sm leading-relaxed [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-xs [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:text-xs [&_th]:bg-muted/50 [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1">
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          components={MD_COMPONENTS}
        >
          {content}
        </ReactMarkdown>
      </div>
      {isStreaming && (
        <span className="ml-0.5 inline-block h-4 w-1 animate-pulse rounded-sm bg-primary" />
      )}
      <div ref={endRef} />
    </div>
  );
}
