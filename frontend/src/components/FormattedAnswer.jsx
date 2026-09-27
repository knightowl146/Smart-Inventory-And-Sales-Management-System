import { Fragment } from "react";
import { toBlocks } from "../utils/answerBlocks";

/**
 * The assistant's answer, with its light formatting shown as formatting.
 *
 * Gemini writes a little Markdown - **bold** product names, numbered lists -
 * and printing it raw left asterisks all over the answer. This handles only
 * that small subset, and builds React elements rather than HTML: the text came
 * from a language model, so it is never passed to dangerouslySetInnerHTML.
 * Anything it does not recognise stays as plain text.
 */

/** **bold** and `code` inside a line. */
const renderInline = (text, keyPrefix) => {
  const pieces = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return pieces.map((piece, index) => {
    const key = `${keyPrefix}-${index}`;
    if (/^\*\*[^*]+\*\*$/.test(piece)) return <strong key={key}>{piece.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(piece)) return <code key={key}>{piece.slice(1, -1)}</code>;
    return <Fragment key={key}>{piece}</Fragment>;
  });
};

const FormattedAnswer = ({ text }) => {
  return toBlocks(text).map((block, index) => {
    if (block.type === "list") {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List key={index} start={block.start} className="ask__list">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item, `${index}-${itemIndex}`)}</li>
          ))}
        </List>
      );
    }

    return <p key={index}>{renderInline(block.lines.join(" "), String(index))}</p>;
  });
};

export default FormattedAnswer;
