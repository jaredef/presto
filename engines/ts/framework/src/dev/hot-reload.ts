// Hypermedia App — Hot Reload
// Injects a polling script into layouts during dev mode.
// Layer 0 compatible — no WebSocket needed.

import type { TemplateProcessor, DataContext } from "../../../src/types";

let devVersion = 0;

export function bumpDevVersion(): void {
  devVersion++;
}

export function getDevVersion(): number {
  return devVersion;
}

export class HotReloadProcessor implements TemplateProcessor {
  name(): string {
    return "dev-hot-reload";
  }

  process(content: string, _context: DataContext): string {
    // Inject polling script before </body>
    const script = `<script>
(function(){
  var v = ${devVersion};
  setInterval(function(){
    fetch('/__dev/version').then(function(r){return r.json()}).then(function(d){
      if(d.v !== v) location.reload();
    }).catch(function(){});
  }, 1000);
})();
</script>`;

    const bodyClose = content.lastIndexOf("</body>");
    if (bodyClose !== -1) {
      return content.substring(0, bodyClose) + script + "\n" + content.substring(bodyClose);
    }
    return content + script;
  }
}
