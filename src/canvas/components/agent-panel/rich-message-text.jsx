/* eslint-disable react/prop-types */

/**
 * Markdown-ish renderer for agent replies.
 *
 * Hand-rolled on purpose: this codebase takes no dependency for something this
 * small, so the parser and the renderer live in one file and `parseMessageBlocks`
 * stays a pure text-in/blocks-out function that a unit test can drive without a
 * DOM.
 *
 * Supported: paragraphs, `-`/`*` lists, GFM pipe tables, and `**bold**` /
 * `` `code` `` inline. Anything else is left as written — agent replies are
 * mostly prose, and guessing wrong reads worse than the raw text. That is the
 * rule the table detection follows too: a line with a `|` in it is prose until
 * a delimiter row proves otherwise.
 */

function renderInline(text, blockOffset) {
  const parts = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) {
      parts.push(text.slice(cursor, match.index));
    }
    const token = match[0];
    const key = `${blockOffset + match.index}-${token.length}`;
    if (token.startsWith("**")) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<code key={key}>{token.slice(1, -1)}</code>);
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

/**
 * `null` is GFM's "no alignment given", which means left. These are AgentPanel.css
 * classes rather than Tailwind's `text-center` etc.: the `th, td` rule in that
 * stylesheet out-specifies a single-class utility, so the utilities would have
 * been present in the markup and ignored on screen.
 */
const ALIGN_CLASS = {
  left: "agent-align-left",
  center: "agent-align-center",
  right: "agent-align-right",
};

/** A delimiter cell is only dashes, plus `:` on either end for alignment. */
const DELIMITER_CELL = /^:?-+:?$/;

/**
 * Splits one table row into cells.
 *
 * A pipe inside a code span, or escaped as `\|`, is content rather than a
 * delimiter: an agent writing `` `a|b` `` inside a cell means that literally.
 * The single empty cell a leading or trailing pipe produces is the row's edge,
 * not a column.
 */
function splitTableRow(line) {
  const spans = [];
  let start = 0;
  let inCode = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\\") {
      index += 1; // an escaped character never delimits
    } else if (char === "`") {
      inCode = !inCode;
    } else if (char === "|" && !inCode) {
      spans.push([start, index]);
      start = index + 1;
    }
  }
  spans.push([start, line.length]);

  const isBlank = ([from, to]) => line.slice(from, to).trim() === "";
  if (spans.length > 1 && isBlank(spans[0])) spans.shift();
  if (spans.length > 1 && isBlank(spans[spans.length - 1])) spans.pop();

  return spans.map(([from, to]) => {
    const raw = line.slice(from, to);
    return {
      // The escape only means something inside a cell, so it is undone here.
      text: raw.trim().replace(/\\\|/g, "|"),
      // A React key seed. It stays inside this cell's own span of the line, so
      // two cells can never seed the same key.
      offset: from + (raw.length - raw.trimStart().length),
    };
  });
}

/**
 * Column alignments from a delimiter row, or `null` when the line is not one.
 * A row is only a delimiter row when every cell is dashes.
 */
function parseDelimiterRow(line) {
  const cells = splitTableRow(line);
  if (cells.length === 0) return null;

  const align = [];
  for (const cell of cells) {
    if (!DELIMITER_CELL.test(cell.text)) return null;
    const left = cell.text.startsWith(":");
    const right = cell.text.endsWith(":");
    // `:-:` centres, `-:` right-aligns, `:-` left-aligns, plain `-` is default.
    align.push(left && right ? "center" : right ? "right" : left ? "left" : null);
  }
  return align;
}

/**
 * Reads a GFM pipe table starting at `start`, or `null` when those lines are
 * not one.
 *
 * The bar for "is a table" is deliberately high. Agent replies are full of
 * prose containing `|` (`value | fallback`, `a | b`), and turning a sentence
 * into a broken one-cell table is worse than leaving it as a paragraph — so a
 * table needs the header to carry a `|`, the next line to be a real delimiter
 * row, and the two to agree on the column count.
 *
 * @returns {{block: object, extraLines: number}|null} `extraLines` counts the
 *   lines consumed *after* the header, so the caller can skip them.
 */
function readTable(lines, lineStarts, start) {
  const headerLine = lines[start];
  if (!headerLine.includes("|")) return null;

  const align = parseDelimiterRow(lines[start + 1] ?? "");
  if (!align) return null;

  const header = splitTableRow(headerLine);
  if (header.length !== align.length) return null;
  if (!header.some((cell) => cell.text !== "")) return null;

  // `splitTableRow` counts from the start of its own line; every offset a block
  // carries is counted from the start of the message, so shift them here.
  const place = (cell, lineIndex) => ({
    ...cell,
    offset: cell.offset + lineStarts[lineIndex],
  });

  const rows = [];
  let index = start + 2;
  // A body row must carry a `|` of its own; a line of plain prose after the
  // table ends it rather than being swallowed as a one-cell row.
  while (
    index < lines.length &&
    lines[index].trim() !== "" &&
    lines[index].includes("|")
  ) {
    // GFM pads a short row with empty cells and drops a long row's excess.
    // Either way the row ends up with the header's column count, so one ragged
    // row cannot shift every cell after it.
    const cells = splitTableRow(lines[index])
      .slice(0, header.length)
      .map((cell) => place(cell, index));
    while (cells.length < header.length) {
      cells.push({ text: "", offset: lineStarts[index] });
    }
    rows.push({
      key: `row-${lineStarts[index]}`,
      cells: cells.map((cell, column) => ({
        ...cell,
        key: `cell-${column}-${cell.offset}`,
      })),
    });
    index += 1;
  }

  return {
    extraLines: index - start - 1,
    block: {
      type: "table",
      key: `table-${lineStarts[start]}`,
      align,
      header: header.map((cell) => {
        const placed = place(cell, start);
        return { ...placed, key: `head-${placed.offset}` };
      }),
      rows,
    },
  };
}

export function parseMessageBlocks(text) {
  const lines = String(text || "").split("\n");
  // Every offset the blocks carry is "characters into the message", so they
  // are resolved up front rather than accumulated as the scan consumes lines —
  // a table consumes several at once.
  const lineStarts = [];
  let cursor = 0;
  for (const line of lines) {
    lineStarts.push(cursor);
    cursor += line.length + 1;
  }

  const blocks = [];
  let paragraph = [];
  let paragraphOffset = 0;
  let list = [];
  let listOffset = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({
      type: "paragraph",
      key: `paragraph-${paragraphOffset}`,
      offset: paragraphOffset,
      text: paragraph.join("\n"),
    });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length === 0) return;
    blocks.push({ type: "list", key: `list-${listOffset}`, items: list });
    list = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const offset = lineStarts[index];
    // Tables are tested first: their rows start with `|` or dashes, and no
    // later branch may claim a line the table already owns.
    const table = readTable(lines, lineStarts, index);

    if (table) {
      flushParagraph();
      flushList();
      blocks.push(table.block);
      index += table.extraLines;
      continue;
    }

    const listMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      if (list.length === 0) listOffset = offset;
      list.push({ key: `item-${offset}`, offset, text: listMatch[1] });
    } else if (line.trim() === "") {
      flushParagraph();
      flushList();
    } else {
      flushList();
      if (paragraph.length === 0) paragraphOffset = offset;
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

/**
 * The table scrolls inside its own box (`.agent-table-scroll` in AgentPanel.css)
 * rather than widening the message: the panel is ~360px wide, so a five-column
 * table has to scroll sideways instead of pushing the bubble — and the panel —
 * out of shape.
 */
function AgentTable({ block }) {
  // `undefined` rather than "": a default-aligned cell gets no class attribute
  // at all, leaving the left-alignment to the stylesheet.
  const cellClass = (column) => ALIGN_CLASS[block.align[column]];
  return (
    <div className="agent-table-scroll ui-scroll">
      <table>
        <thead>
          <tr>
            {block.header.map((cell, column) => (
              <th key={cell.key} className={cellClass(column)}>
                {renderInline(cell.text, cell.offset)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, column) => (
                <td key={cell.key} className={cellClass(column)}>
                  {renderInline(cell.text, cell.offset)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderBlock(block) {
  if (block.type === "table") return <AgentTable key={block.key} block={block} />;
  if (block.type === "list") {
    return (
      <ul key={block.key}>
        {block.items.map((item) => (
          <li key={item.key}>{renderInline(item.text, item.offset)}</li>
        ))}
      </ul>
    );
  }
  return <p key={block.key}>{renderInline(block.text, block.offset)}</p>;
}

export default function RichMessageText({ text }) {
  return (
    <div className="agent-rich-message">
      {parseMessageBlocks(text).map(renderBlock)}
    </div>
  );
}
