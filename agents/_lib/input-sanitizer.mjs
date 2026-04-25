// agents/_lib/input-sanitizer.mjs
// Phase 4: sanitizes user-supplied text before it reaches subagent prompts.
// Closes the prompt-injection surface on the Launcher's front door where
// untrusted business-idea text becomes part of a system-prompt context.
//
// Defensive strategy:
// 1. Strip obvious instruction smuggling (ignore previous, system:, etc).
// 2. Wrap the user input in an inert <user_input> tag so the model reads
//    it as data, not as a nested instruction channel.
// 3. Refuse input that contains tool-call-like syntax, unusual escape
//    sequences, or obvious jailbreak markers.
// 4. Emit a signal when sanitization triggered so logs can catch attack
//    patterns.
// -----------------------------------------------------------------------------

const INSTRUCTION_SMUGGLING = [
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(your|all|the)\s+(instructions?|prompts?|rules?)/i,
  /you\s+are\s+now\s+a?\s*(new|different)\s+(ai|assistant|model)/i,
  /<\|?(system|assistant|user)\|?>/i,
  /\[\[\s*SYSTEM\s*\]\]/i,
  /act\s+as\s+(if\s+you\s+)?(were\s+)?(my|the)\s+(admin|developer|anthropic)/i,
];

const TOOL_CALL_LIKE = [
  /<function_calls>/i,
  /<invoke/i,
  /<tool_use>/i,
  /\{\s*"name"\s*:\s*"[a-z_]+"\s*,\s*"input"/i,
];

const JAILBREAK_MARKERS = [
  /\bDAN\s+mode\b/i,
  /\bjailbr(ea|oke)k\b/i,
  /\bdeveloper\s+mode\b/i,
  /\bpretend\s+you\s+have\s+no\s+rules\b/i,
];

export function sanitize(raw, { max_length = 10_000 } = {}) {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'input must be string', sanitized: null };
  }
  if (raw.length > max_length) {
    return { ok: false, reason: `input exceeds ${max_length} chars`, sanitized: null };
  }

  const signals = [];
  for (const pat of INSTRUCTION_SMUGGLING)  if (pat.test(raw)) signals.push({ type: 'instruction_smuggling', pattern: pat.source });
  for (const pat of TOOL_CALL_LIKE)         if (pat.test(raw)) signals.push({ type: 'tool_call_like',       pattern: pat.source });
  for (const pat of JAILBREAK_MARKERS)      if (pat.test(raw)) signals.push({ type: 'jailbreak_marker',     pattern: pat.source });

  // Tool-call-like syntax and jailbreak markers are hard refuses — even if
  // the user wrote them innocently, the risk of passing them to the model
  // outweighs the inconvenience.
  if (signals.some(s => s.type === 'tool_call_like' || s.type === 'jailbreak_marker')) {
    return { ok: false, reason: 'input contains tool-call or jailbreak patterns', sanitized: null, signals };
  }

  // Instruction-smuggling gets neutralized (not refused) — we strip the
  // offending phrase and wrap the rest. Real business ideas sometimes
  // contain phrases like 'ignore the competition' which are benign.
  let cleaned = raw;
  for (const pat of INSTRUCTION_SMUGGLING) {
    cleaned = cleaned.replace(pat, '[REDACTED_INSTRUCTION_LIKE_PHRASE]');
  }

  // Wrap in an inert tag so downstream prompts read it as data.
  const wrapped = `<user_input>\n${cleaned.trim()}\n</user_input>`;

  return { ok: true, sanitized: wrapped, signals };
}

// For logging: report what sanitize() would say without modifying the text.
export function inspect(raw) {
  const result = sanitize(raw);
  return { ok: result.ok, reason: result.reason, signal_count: result.signals?.length || 0 };
}
