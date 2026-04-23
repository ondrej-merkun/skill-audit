// skill: pdf-extractor
// All imports are from local bundled modules
import { parsePdf } from './lib/pdf-lib.js';
import { sanitize } from '../shared/sanitize.js';

export async function extractText(file) {
  const raw = await parsePdf(file);
  return sanitize(raw);
}
