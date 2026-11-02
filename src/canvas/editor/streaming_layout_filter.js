/**
 * Real-time filter separating reasoning tokens (<think>...</think> and delta.reasoning_content)
 * from HTML layout tokens, stripping markdown code fences in real time.
 *
 * Lightweight, zero-dependency string streaming utility extracted from html_import.js
 * to keep the critical canvas bundle decoupled from heavy document parsing algorithms.
 */

/** Strips markdown fences and keeps only the payload. */
export function extractHtmlSnippet(html) {
  let text = String(html ?? "").trim();
  text = text.replace(/^```[a-zA-Z]*\s*/gm, "").replace(/^```\s*$/gm, "");
  const firstFence = text.indexOf("```");
  if (firstFence >= 0) {
    const close = text.indexOf("```", firstFence + 3);
    text = (
      text.slice(0, firstFence) + (close >= 0 ? text.slice(close + 3) : "")
    ).trim();
  }
  return text.trim();
}

/**
 * Real-time filter separating reasoning tokens (<think>...</think> and delta.reasoning_content)
 * from HTML layout tokens, stripping markdown code fences in real time.
 */
export class StreamingLayoutFilter {
  constructor({
    onReasoningChunk = () => {},
    onHtmlChunk = () => {},
    onDesignDecision = () => {},
    onPaletteExtracted = () => {},
    onCritiqueResult = () => {},
  } = {}) {
    this.onReasoningChunk = onReasoningChunk;
    this.onHtmlChunk = onHtmlChunk;
    this.onDesignDecision = onDesignDecision;
    this.onPaletteExtracted = onPaletteExtracted;
    this.onCritiqueResult = onCritiqueResult;
    this.rawBuffer = "";
    this.sseReasoningBuffer = "";
    this.inContentReasoning = "";
    this.reasoningBuffer = "";
    this.htmlBuffer = "";
    this.lastEmittedHtml = "";
    this.lastEmittedReasoning = "";
  }

  feed(chunk, reasoningDelta = "") {
    if (reasoningDelta) {
      this.sseReasoningBuffer += String(reasoningDelta);
    }

    if (chunk) {
      this.rawBuffer += String(chunk);
    }

    this._process();
  }

  feedAccumulated(accumulated, accumulatedReasoning) {
    if (accumulatedReasoning !== undefined && accumulatedReasoning !== null) {
      const reasoning = String(accumulatedReasoning);
      this.sseReasoningBuffer = reasoning;
    }

    const text = String(accumulated ?? "");
    if (text === this.rawBuffer) {
      this._process();
      return;
    }

    if (text.startsWith(this.rawBuffer)) {
      this.rawBuffer = text;
      this._process();
      return;
    }

    this.rawBuffer = text;
    this._process();
  }

  _process() {
    let raw = this.rawBuffer;
    let reasoningInContent = "";

    raw = raw.replace(/<think\b[^>]*>([\s\S]*?)<\/think>/gi, (_, content) => {
      reasoningInContent += content;
      return "";
    });

    const unclosedMatch = raw.match(/<think\b[^>]*>/i);
    if (unclosedMatch) {
      const unclosedIdx = unclosedMatch.index;
      const tagLength = unclosedMatch[0].length;
      let partialReasoning = raw.slice(unclosedIdx + tagLength);
      partialReasoning = partialReasoning.replace(
        /<\/?(?:think|thin|thi|th|t)?\s*$/i,
        "",
      );
      reasoningInContent += partialReasoning;
      raw = raw.slice(0, unclosedIdx);
    } else {
      raw = raw.replace(/<(?:think|thin|thi|th|t)?\s*$/i, "");
    }

    this.inContentReasoning = reasoningInContent;
    const totalReasoning = this.sseReasoningBuffer + this.inContentReasoning;
    this.reasoningBuffer = totalReasoning;

    if (totalReasoning !== this.lastEmittedReasoning) {
      if (totalReasoning.startsWith(this.lastEmittedReasoning)) {
        const delta = totalReasoning.slice(this.lastEmittedReasoning.length);
        this.lastEmittedReasoning = totalReasoning;
        if (delta) {
          this.onReasoningChunk?.(delta, this.reasoningBuffer);
        }
      } else {
        this.lastEmittedReasoning = totalReasoning;
        if (totalReasoning) {
          this.onReasoningChunk?.(totalReasoning, this.reasoningBuffer);
        }
      }
    }

    const cleanHtml = extractHtmlSnippet(raw);
    if (cleanHtml !== this.lastEmittedHtml) {
      this.lastEmittedHtml = cleanHtml;
      this.htmlBuffer = cleanHtml;
      this.onHtmlChunk?.(cleanHtml);
    }
  }

  getHtml() {
    return this.htmlBuffer;
  }

  getReasoning() {
    return this.reasoningBuffer;
  }

  finish() {
    this._process();
    return {
      html: this.getHtml(),
      reasoning: this.getReasoning(),
    };
  }
}
