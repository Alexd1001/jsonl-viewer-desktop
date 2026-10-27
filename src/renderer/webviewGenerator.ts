import { styles } from '../webview/styles';
import { scripts } from '../webview/scripts';
import { getHtmlTemplate } from '../webview/template';
import { getThemeVariablesCSS } from '../theme/themes';

export function generateWebviewHtml(theme: 'dark' | 'light', gazelleSvgUri: string, gazelleGifUri: string): string {
  const themeVars = getThemeVariablesCSS(theme);

  const vsCodeShim = `
    const __parentBridge = {
      postMessage: function(msg) {
        window.parent.postMessage({ source: 'gazelle-webview', payload: msg }, '*');
      },
      getState: function() {
        try {
          return JSON.parse(sessionStorage.getItem('__gazelle_view_state') || '{}');
        } catch { return {}; }
      },
      setState: function(s) {
        try {
          sessionStorage.setItem('__gazelle_view_state', JSON.stringify(s));
        } catch {}
      }
    };
    function acquireVsCodeApi() {
      return __parentBridge;
    }
  `;

  const customStyles = `
    :root {
${themeVars}
    }
${styles}
  `;

  const fullScripts = `
${vsCodeShim}
${scripts}
  `;

  // Use the exact complete HTML template from upstream
  let html = getHtmlTemplate(
    gazelleSvgUri,
    gazelleGifUri,
    customStyles,
    fullScripts,
    'https:',
    'dummy-nonce'
  );

  // Set default body class to vscode-dark so Monaco and background inherit dark mode
  const bodyClass = theme === 'dark' ? 'vscode-dark' : 'vscode-light';
  html = html.replace('<body>', '<body class="' + bodyClass + '">');

  // Strip restrictive meta CSP tag so local srcdoc can render freely
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i, '');

  return html;
}
