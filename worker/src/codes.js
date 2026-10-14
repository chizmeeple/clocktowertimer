import { CODE_ALPHABET } from './protocol.js';

// Tests inject a short queue through the isolate global. Production calls
// never set it, so codes come from crypto.getRandomValues.
const SEQUENCE_KEY = '__clocktowerCompanionCodeSequence';

export function setCodeSequence(codes) {
  if (codes == null) delete globalThis[SEQUENCE_KEY];
  else globalThis[SEQUENCE_KEY] = [...codes];
}

export function takeCode() {
  const sequence = globalThis[SEQUENCE_KEY];
  if (Array.isArray(sequence) && sequence.length > 0) return sequence.shift();
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) code += CODE_ALPHABET[byte & 31];
  return code;
}
