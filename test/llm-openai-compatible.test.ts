import { describe, expect, it, vi } from 'vitest';
import { checkOpenAiCompatibleConnection } from '../packages/cli/src/llm/openai-compatible.js';
import type { FetchLike } from '../packages/cli/src/llm/openai-compatible.js';

describe('OpenAI-compatible LLM health checks', () => {
  it('uses a 60 second default timeout when the model has no override', async () => {
    vi.useFakeTimers();
    try {
      const hangingFetch: FetchLike = async (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        });

      const resultPromise = checkOpenAiCompatibleConnection(
        {
          name: 'local',
          provider: 'openai-compatible',
          baseUrl: 'http://localhost:11434',
          model: 'llama3',
        },
        hangingFetch
      );
      let settled = false;
      resultPromise.then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(59_999);
      await Promise.resolve();
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);

      await expect(resultPromise).resolves.toMatchObject({ status: 'timeout' });
    } finally {
      vi.useRealTimers();
    }
  });
});
