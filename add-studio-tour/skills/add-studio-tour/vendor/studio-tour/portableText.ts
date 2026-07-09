/**
 * Pure, dependency-free Portable Text → **safe** HTML serializer for tour step
 * copy. No React or Sanity imports (mirrors `targeting.ts` / `progress.ts`) so it
 * is unit-testable in isolation (see ../../tests/portableText.test.ts).
 *
 * WHY THIS EXISTS: driver.js renders popover title/description via `innerHTML`.
 * Earlier the step description was a free-text field advertised as "basic HTML
 * supported" and passed straight through — a stored-XSS sink, because an author
 * (any role with write access to the tour type) could plant
 * `<img src=x onerror=…>` that then executed in another user's authenticated
 * Studio session. Step copy is now authored as Portable Text and serialized
 * HERE: every text node is HTML-escaped and only a fixed allowlist of tags is
 * emitted, so no author-supplied markup can reach the DOM as active content.
 * `escapeHtml` is also used for the (plain-string) step title before it is handed
 * to driver.js.
 */

export interface PortableTextSpan {
  _type?: string
  _key?: string
  text?: string
  marks?: string[]
}

export interface PortableTextMarkDef {
  _type?: string
  _key?: string
  href?: string
}

export interface PortableTextBlock {
  _type?: string
  _key?: string
  style?: string
  listItem?: string
  level?: number
  children?: PortableTextSpan[]
  markDefs?: PortableTextMarkDef[]
}

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escape the five HTML-significant characters so a string renders as literal text. */
export function escapeHtml(input: unknown): string {
  return String(input ?? '').replace(/[&<>"']/g, (c) => ESCAPE_MAP[c])
}

/**
 * Allowlist a link href. Relative/anchor links pass; among absolute URLs only
 * http/https/mailto/tel are allowed. Everything else — notably `javascript:`,
 * `data:`, `vbscript:` — is dropped so a link annotation can't smuggle script.
 *
 * FIRST strip every ASCII control char, whitespace, and space (0x00–0x20 + DEL):
 * a browser removes tab/newline/CR (and trims leading control chars) while
 * resolving a URL, so `java&#9;script:…` or a leading `\x01` would otherwise slip
 * past the scheme check here and re-form into `javascript:` on click. Validate —
 * and emit — the cleaned form, so what's checked is what the browser will run.
 */
function safeHref(href: string | undefined): string | null {
  if (!href) return null
  const cleaned = href.replace(/[\u0000-\u0020\u007F\u200B-\u200D\u2060\uFEFF]/g, '')
  if (!cleaned) return null
  // Relative path, root-relative, or in-page anchor — no scheme, safe.
  if (/^(\/|#|\.|\?)/.test(cleaned)) return cleaned
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned)
  if (!m) return cleaned // no scheme at all → treat as relative
  const scheme = m[1].toLowerCase()
  return scheme === 'http' || scheme === 'https' || scheme === 'mailto' || scheme === 'tel'
    ? cleaned
    : null
}

// Inline decorator marks → the tag pair they wrap the (escaped) text in.
const DECORATOR_TAGS: Record<string, [string, string]> = {
  strong: ['<strong>', '</strong>'],
  em: ['<em>', '</em>'],
  underline: ['<u>', '</u>'],
  'strike-through': ['<s>', '</s>'],
  code: ['<code>', '</code>'],
}

function renderSpan(span: PortableTextSpan, markDefs: PortableTextMarkDef[]): string {
  let html = escapeHtml(span?.text ?? '')
  const marks = Array.isArray(span?.marks) ? span.marks : []
  for (const mark of marks) {
    const deco = DECORATOR_TAGS[mark]
    if (deco) {
      html = deco[0] + html + deco[1]
      continue
    }
    // Non-decorator mark → an annotation referenced by _key in markDefs.
    const def = markDefs.find((d) => d?._key === mark)
    if (def && def._type === 'link') {
      const href = safeHref(def.href)
      if (href) {
        html = `<a href="${escapeHtml(href)}" rel="noopener noreferrer" target="_blank">${html}</a>`
      }
    }
    // Unknown marks are ignored (text still rendered, escaped) — safe default.
  }
  return html
}

const BLOCK_STYLE_TAGS: Record<string, [string, string]> = {
  h1: ['<h1>', '</h1>'],
  h2: ['<h2>', '</h2>'],
  h3: ['<h3>', '</h3>'],
  h4: ['<h4>', '</h4>'],
  h5: ['<h5>', '</h5>'],
  h6: ['<h6>', '</h6>'],
  blockquote: ['<blockquote>', '</blockquote>'],
}

/**
 * Serialize Portable Text to a safe HTML string for driver.js's popover body.
 *
 * - `blocks` is normally a PortableTextBlock[]; a plain string is accepted for
 *   back-compat with tours authored under the old free-text field (escaped and
 *   wrapped in a paragraph — so old tours keep rendering, as plain text).
 * - Only `block` members are rendered; any custom block type (images, embeds,
 *   etc.) is skipped — a safe default rather than a guess.
 * - Consecutive `listItem` blocks are grouped into a single <ul>/<ol>.
 * - ALL text is HTML-escaped; only allowlisted tags are emitted; link hrefs are
 *   scheme-checked. There is no path for author-supplied markup to execute.
 */
export function portableTextToSafeHtml(blocks: unknown): string {
  if (typeof blocks === 'string') {
    return blocks.trim() ? `<p>${escapeHtml(blocks)}</p>` : ''
  }
  if (!Array.isArray(blocks)) return ''

  const out: string[] = []
  let listType: string | null = null
  let listBuf: string[] = []
  const flushList = () => {
    if (!listBuf.length) return
    const tag = listType === 'number' ? 'ol' : 'ul'
    out.push(`<${tag}>${listBuf.join('')}</${tag}>`)
    listBuf = []
    listType = null
  }

  for (const block of blocks as PortableTextBlock[]) {
    if (!block || typeof block !== 'object') continue
    // Skip non-text blocks (custom object types) entirely.
    if (block._type && block._type !== 'block') {
      flushList()
      continue
    }
    const children = Array.isArray(block.children) ? block.children : []
    const markDefs = Array.isArray(block.markDefs) ? block.markDefs : []
    const inner = children.map((c) => renderSpan(c, markDefs)).join('')

    if (block.listItem) {
      if (listType && listType !== block.listItem) flushList()
      listType = block.listItem
      listBuf.push(`<li>${inner}</li>`)
      continue
    }

    flushList()
    const pair = BLOCK_STYLE_TAGS[block.style ?? 'normal']
    out.push(pair ? `${pair[0]}${inner}${pair[1]}` : `<p>${inner}</p>`)
  }
  flushList()
  return out.join('')
}

/** Plain-text projection of Portable Text (no markup) — handy for previews/logs. */
export function portableTextToPlainText(blocks: unknown): string {
  if (typeof blocks === 'string') return blocks
  if (!Array.isArray(blocks)) return ''
  return (blocks as PortableTextBlock[])
    .filter((b) => b && typeof b === 'object' && (!b._type || b._type === 'block'))
    .map((b) => (Array.isArray(b.children) ? b.children.map((c) => c?.text ?? '').join('') : ''))
    .join('\n')
    .trim()
}
