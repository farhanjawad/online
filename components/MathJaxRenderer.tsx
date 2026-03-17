"use client";

import { useEffect, useRef } from "react";

interface MathJaxRendererProps {
  html: string;
  className?: string;
  inline?: boolean;
}

declare global {
  interface Window {
    MathJax?: {
      typesetPromise: (elements?: HTMLElement[]) => Promise<void>;
      startup?: { promise: Promise<void> };
    };
  }
}

/**
 * Rewrites every <img src="..."> in the container so that:
 *
 *   • CDN URLs (http:// / https://) → left untouched
 *   • Already-correct local paths (/images/...) → left untouched
 *   • Anything else (relative paths from the scraped JSON, e.g.
 *       "images/bio_1.png", "../../images/bio_1.png",
 *       "../public/images/bio_1.png", "bio_1.png")
 *     → extract just the filename and rewrite to /images/{filename}
 *
 * Images must be placed in  /public/images/  so Next.js serves them at
 * the root path  /images/{filename}.
 *
 * This runs BEFORE MathJax typesetting so MathJax never sees broken src
 * attributes that might affect layout.
 */
function fixImagePaths(container: HTMLElement): void {
  container.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    const src = img.getAttribute("src");
    if (!src) return;

    // Already absolute URLs — leave as-is
    if (src.startsWith("http://") || src.startsWith("https://")) return;

    // Already the correct local path — leave as-is
    if (src.startsWith("/images/")) return;

    // Extract just the filename from any relative path (handles ../../ etc.)
    // e.g. "../../public/images/bio_q3.png"  →  "bio_q3.png"
    const filename = src.split(/[/\\]/).filter(Boolean).pop() ?? src;
    img.src = `/images/${filename}`;

    // Show a light placeholder background while the image loads, and a
    // visible broken-image indicator if it ultimately 404s
    img.style.minWidth  = "40px";
    img.style.minHeight = "20px";
    img.onerror = () => {
      img.alt   = img.alt || `[image: ${filename}]`;
      img.style.outline    = "1px dashed var(--text-muted)";
      img.style.padding    = "2px 6px";
      img.style.borderRadius = "4px";
      img.style.fontSize   = "11px";
      img.style.color      = "var(--text-muted)";
    };
  });
}

export default function MathJaxRenderer({
  html,
  className = "",
  inline = false,
}: MathJaxRendererProps) {
  const containerRef = useRef<HTMLDivElement | HTMLSpanElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Step 1 — Fix image src paths BEFORE MathJax runs
    // (MathJax may reflow the DOM; doing this first avoids race conditions)
    fixImagePaths(container);

    // Step 2 — Trigger MathJax typesetting
    const typeset = async () => {
      try {
        if (window.MathJax?.startup) {
          await window.MathJax.startup.promise;
        }
        if (window.MathJax?.typesetPromise) {
          await window.MathJax.typesetPromise([container]);
        }
      } catch (err) {
        console.debug("MathJax typeset skipped:", err);
      }
    };

    typeset();
  }, [html]); // Re-runs whenever the HTML content changes

  const sharedProps = {
    ref: containerRef as React.RefObject<HTMLDivElement & HTMLSpanElement>,
    className: `question-content ${className}`,
    dangerouslySetInnerHTML: { __html: html },
  };

  return inline ? <span {...sharedProps} /> : <div {...sharedProps} />;
}
