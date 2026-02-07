import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Allows safe subset of HTML produced by TipTap editor.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
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
    ALLOWED_ATTR: [
      "href", "target", "rel", "src", "alt", "title", "width", "height",
      "class", "style", "id",
      // Table attributes
      "colspan", "rowspan",
    ],
    ALLOW_DATA_ATTR: false,
    // Force safe link targets
    ADD_ATTR: ["target"],
    // Protocol whitelist for href/src
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}
