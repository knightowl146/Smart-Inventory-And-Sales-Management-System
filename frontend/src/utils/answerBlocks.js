/**
 * Reading the small amount of Markdown the assistant writes: paragraphs,
 * numbered and bulleted lists. Kept free of React so it can be checked on its
 * own; components/FormattedAnswer.jsx turns the blocks into elements.
 */

export const LIST_ITEM = /^\s*(?:(\d+)[.)]|[-*•])\s+(.*)$/;

/**
 * A list the model ran together on one line: "... 1. **A**: x 2. **B**: y".
 * Split before each number that continues the sequence (1, 2, 3...), and only
 * when followed by bold or a capital - so "4.5 units" or "version 2. of" are
 * left alone.
 */
export const splitInlineList = (line) => {
  const positions = [];
  let from = 0;

  for (let n = 1; ; n += 1) {
    const marker = new RegExp(`(^|\\s)${n}[.)]\\s+(?=\\*\\*|[A-Z])`, "g");
    marker.lastIndex = from;
    const match = marker.exec(line);
    if (!match) break;

    const position = match.index + match[1].length;
    positions.push(position);
    from = position + 1;
  }

  // One number on its own is not a run-together list.
  if (positions.length < 2) return [line];

  const parts = [];
  const lead = line.slice(0, positions[0]).trim();
  if (lead) parts.push(lead);

  positions.forEach((position, index) => {
    parts.push(line.slice(position, positions[index + 1] ?? line.length).trim());
  });

  return parts;
};

/** Group an answer's lines into paragraphs and lists. */
export const toBlocks = (text) => {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .flatMap(splitInlineList)
    .map((line) => line.trimEnd());

  const blocks = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "p", lines: paragraph });
    paragraph = [];
  };

  for (const line of lines) {
    const item = LIST_ITEM.exec(line);

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    if (item) {
      flushParagraph();
      const ordered = item[1] !== undefined;
      const last = blocks[blocks.length - 1];

      if (last && last.type === "list" && last.ordered === ordered) {
        last.items.push(item[2]);
      } else {
        blocks.push({ type: "list", ordered, start: ordered ? Number(item[1]) : undefined, items: [item[2]] });
      }
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  return blocks;
};
