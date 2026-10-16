import { plugin } from 'bun';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { sassPlugin } from '../scripts/sass-plugin';

// Stylesheets are imported as compiled CSS strings, as in the build.
plugin(sassPlugin);

if (!('window' in globalThis)) {
  // Tests must never reach the network: iframes (video embeds), scripts and
  // stylesheets stay unloaded.
  GlobalRegistrator.register({
    url: 'http://localhost',
    settings: {
      disableIframePageLoading: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
    },
  });
}
