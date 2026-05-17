import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo } from "react";

function renderMath(text: string): string {
  let result = "";
  let remaining = text;

  while (remaining.length > 0) {
    const displayIdx = remaining.indexOf("$$");
    const inlineIdx = remaining.indexOf("$");

    if (displayIdx === 0) {
      const end = remaining.indexOf("$$", 2);
      if (end !== -1) {
        const math = remaining.slice(2, end);
        try {
          result += katex.renderToString(math, { displayMode: true, throwOnError: false });
        } catch {
          result += `$$${math}$$`;
        }
        remaining = remaining.slice(end + 2);
        continue;
      }
    }

    if (inlineIdx === 0) {
      const end = remaining.indexOf("$", 1);
      if (end !== -1) {
        const math = remaining.slice(1, end);
        try {
          result += katex.renderToString(math, { displayMode: false, throwOnError: false });
        } catch {
          result += `$${math}$`;
        }
        remaining = remaining.slice(end + 1);
        continue;
      }
    }

    const nextDisplay = remaining.indexOf("$$");
    const nextInline = remaining.indexOf("$");
    const nextMath = nextDisplay !== -1 && nextDisplay < nextInline ? nextDisplay : nextInline;

    if (nextMath === -1) {
      result += escapeHtml(remaining);
      remaining = "";
    } else {
      result += escapeHtml(remaining.slice(0, nextMath));
      remaining = remaining.slice(nextMath);
    }
  }

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface MathTextProps {
  children: string;
  className?: string;
  block?: boolean;
}

export function MathText({ children, className, block = false }: MathTextProps) {
  const html = useMemo(() => renderMath(children), [children]);
  const Tag = block ? "div" : "span";
  return (
    <Tag
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
