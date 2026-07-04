// Lightweight post-generation checks: strip banned "AI-speak" openers and
// em-dashes before any generated text reaches the user. The system prompt
// forbids these too; this is the backstop.

const BANNED_OPENERS: RegExp[] = [
  /^(that['’]?s\s+(a\s+)?(really\s+|very\s+)?(great|good|excellent|fantastic|wonderful|interesting)\s+question[.!,:]*\s*)/i,
  /^((great|good|excellent|fantastic|wonderful|interesting)\s+question[.!,:]*\s*)/i,
  /^(i['’]?m\s+(so\s+|really\s+)?glad\s+you\s+asked[^.!,:]*[.!,:]*\s*)/i,
  /^(thanks?\s+for\s+(asking|the\s+question)[^.!,:]*[.!,:]*\s*)/i,
  /^(absolutely[.!,:]*\s+)/i,
  /^(certainly[.!,:]*\s+)/i,
  /^(sure(\s+thing)?[.!,:]*\s+)/i
];

export interface CleanResult {
  text: string;
  flags: string[];
}

export function cleanGeneratedText(input: string): CleanResult {
  const flags: string[] = [];
  let text = input.trim();

  // Strip banned openers, repeatedly in case two are stacked.
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const re of BANNED_OPENERS) {
      const m = text.match(re);
      if (m) {
        text = text.slice(m[0].length).trimStart();
        flags.push(`stripped banned opener: "${m[0].trim()}"`);
        stripped = true;
      }
    }
  }

  // Replace em/en dashes used as connectors with plain punctuation.
  if (/[—–]/.test(text)) {
    flags.push("replaced em-dash");
    text = text.replace(/\s*[—–]\s*/g, ", ");
  }

  // Re-capitalize if the opener strip left a lowercase start.
  if (text.length > 0) {
    text = text[0].toUpperCase() + text.slice(1);
  }

  return { text, flags };
}

export function cleanList(items: string[]): { items: string[]; flags: string[] } {
  const flags: string[] = [];
  const out = items.map((s) => {
    const r = cleanGeneratedText(s);
    flags.push(...r.flags);
    return r.text;
  });
  return { items: out.filter((s) => s.length > 0), flags };
}
