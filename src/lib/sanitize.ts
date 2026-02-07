import sanitize from "sanitize-html";

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Allows safe subset of HTML produced by TipTap editor.
 * Uses sanitize-html (pure Node.js, no jsdom dependency).
 */
export function sanitizeHtml(dirty: string): string {
  return sanitize(dirty, {
    allowedTags: [
      // Text formatting
      "p", "br", "strong", "em", "u", "s", "del", "sub", "sup",
      "b", "i", "mark", "small", "abbr", "code", "pre",
      // Headings
      "h1", "h2", "h3", "h4", "h5", "h6",
      // Lists
      "ul", "ol", "li",
      // Links & media
      "a", "img",
      // Structure
      "blockquote", "hr", "div", "span",
      // Tables
      "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel", "title"],
      img: ["src", "alt", "title", "width", "height"],
      "*": ["class", "style", "id"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
    },
    allowedSchemes: ["https", "http", "mailto"],
    // Force noopener on links
    transformTags: {
      a: sanitize.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
  });
}
