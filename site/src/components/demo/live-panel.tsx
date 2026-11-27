import { Den } from "@slopgoblin/extension/sidepanel/Den.tsx";
import { Home, HomeTop } from "@slopgoblin/extension/sidepanel/Home.tsx";
import { HostContext } from "@slopgoblin/extension/sidepanel/host.ts";
import { Lurker } from "@slopgoblin/extension/sidepanel/Lurker.tsx";

import type { Demo } from "@/hooks/use-demo";

/**
 * The extension's own side panel, run on the demo feed. Its tab is x.com, with the posts the goblin
 * hasn't read yet on the way.
 */
export function LivePanel({ demo }: { demo: Demo }) {
  const { settings, checked, hidden, pending } = demo;
  return (
    <div className="live-panel">
      <HostContext value={demo.host}>
        <Den
          header={<HomeTop enabled={settings.enabled} />}
          goblin={<Lurker awake={settings.enabled} fed={hidden.length} />}
        >
          <div className="sheet-body">
            <Home
              settings={settings}
              checked={checked}
              hidden={hidden}
              tab={{ id: 0, url: "https://x.com/home", state: { pending, broken: false } }}
            />
          </div>
        </Den>
      </HostContext>
    </div>
  );
}
