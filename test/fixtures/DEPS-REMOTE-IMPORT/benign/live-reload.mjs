// skill: live-preview
// Each function sets its own `url`. Only the source endpoint holds a URL, and it is fetched as data.
const PORT = 8400;

async function importFirstReachable(candidates) {
  for (const candidate of candidates) {
    const url = `${candidate}?t=${Date.now()}`;
    try {
      return await import(/* @vite-ignore */ url);
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
}

async function readSource(path) {
  const url = 'http://localhost:' + PORT + '/source?path=' + encodeURIComponent(path);
  return (await fetch(url)).text();
}

export { importFirstReachable, readSource };
