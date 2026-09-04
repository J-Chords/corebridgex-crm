import { Fragment, type ReactNode } from "react";

/**
 * Project Level Part 6 — the v1 safe rich-text renderer for Project Description. Hand-rolled,
 * zero third-party dependency: every returned node is a plain React element built from parsed
 * text, never a raw HTML string — so there is nothing here for `dangerouslySetInnerHTML` to ever
 * need, and no way for a `<script>`/event-handler attribute typed into the field to execute.
 * Supports exactly: **bold**, italics (single asterisk or underscore), "- "/"* " bullet lists, "1. " numbered lists,
 * [text](url) links, ![alt](url) images. Anything else (raw HTML tags, unsupported syntax) is
 * left as plain visible text — it degrades, it never gets interpreted.
 */

/** Only http/https render as a real link/image — `javascript:`, `data:`, `vbscript:`, and every
 * other scheme (or a scheme-less value) silently degrade to plain text instead of executing. */
function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

const INLINE_PATTERN =
  /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]*)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  INLINE_PATTERN.lastIndex = 0;
  while ((match = INLINE_PATTERN.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const key = `${keyPrefix}-${i++}`;
    const [, imgAlt, imgUrl, linkText, linkUrl, boldA, boldB, italicA, italicB] = match;
    if (imgUrl !== undefined) {
      nodes.push(
        isSafeUrl(imgUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary external URL, not a same-origin asset next/image can optimize
          <img key={key} src={imgUrl} alt={imgAlt} className="my-1 max-w-full rounded-md" />
        ) : (
          imgAlt || match[0]
        )
      );
    } else if (linkUrl !== undefined) {
      nodes.push(
        isSafeUrl(linkUrl) ? (
          <a
            key={key}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline underline-offset-2"
          >
            {linkText || linkUrl}
          </a>
        ) : (
          linkText || match[0]
        )
      );
    } else if (boldA !== undefined || boldB !== undefined) {
      nodes.push(<strong key={key}>{boldA ?? boldB}</strong>);
    } else if (italicA !== undefined || italicB !== undefined) {
      nodes.push(<em key={key}>{italicA ?? italicB}</em>);
    }
    lastIndex = INLINE_PATTERN.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

const BULLET_RE = /^\s*[-*]\s+/;
const NUMBERED_RE = /^\s*\d+\.\s+/;

export function renderMarkdownLite(text: string): ReactNode {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let blockKey = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (BULLET_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && BULLET_RE.test(lines[i])) {
        items.push(lines[i].replace(BULLET_RE, ""));
        i++;
      }
      const key = blockKey++;
      blocks.push(
        <ul key={`b-${key}`} className="list-disc pl-5">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `ul-${key}-${idx}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (NUMBERED_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && NUMBERED_RE.test(lines[i])) {
        items.push(lines[i].replace(NUMBERED_RE, ""));
        i++;
      }
      const key = blockKey++;
      blocks.push(
        <ol key={`b-${key}`} className="list-decimal pl-5">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `ol-${key}-${idx}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !BULLET_RE.test(lines[i]) && !NUMBERED_RE.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    const key = blockKey++;
    blocks.push(
      <p key={`b-${key}`}>
        {paraLines.map((l, idx) => (
          <Fragment key={idx}>
            {idx > 0 && <br />}
            {renderInline(l, `p-${key}-${idx}`)}
          </Fragment>
        ))}
      </p>
    );
  }
  return blocks;
}

export function SafeMarkdown({ text, className }: { text: string; className?: string }) {
  return <div className={className}>{renderMarkdownLite(text)}</div>;
}
