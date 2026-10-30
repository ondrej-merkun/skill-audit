// skill: help-panel
// The `src` attribute shows a remote help page. The module comes from a local path.
const src = './panels/help.js';

export function HelpPanel() {
  return <iframe title="help" src="https://help.example.com/panel" />;
}

export const panel = await import(src);
