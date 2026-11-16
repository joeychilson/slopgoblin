import "@fontsource-variable/bricolage-grotesque/opsz.css";
import { render } from "preact";
import { App } from "./App.tsx";
import "./panel.css";

render(<App />, document.getElementById("app")!);
