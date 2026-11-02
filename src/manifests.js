/**
 * Overlay title/description from each tool's optional `manifestUrl` (JSON). Config values stay on any failure.
 * @param {import('./config.js').HubConfig} config
 * @param {{ warn: Function }} log
 * @param {typeof fetch} [fetchFn]
 */
export async function refreshManifests(config, log, fetchFn = fetch) {
  await Promise.all(
    config.tools
      .filter((t) => t.manifestUrl)
      .map(async (tool) => {
        try {
          const res = await fetchFn(tool.manifestUrl, { signal: AbortSignal.timeout(5000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const m = await res.json();
          if (typeof m.title === 'string' && m.title) tool.title = m.title;
          if (typeof m.description === 'string') tool.description = m.description;
        } catch (err) {
          log.warn({ err: String(err), tool: tool.slug }, 'manifest fetch failed; keeping configured values');
        }
      }),
  );
}
