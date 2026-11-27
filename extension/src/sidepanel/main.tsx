import "@fontsource-variable/bricolage-grotesque/opsz.css";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./tokens.css";
import "./panel.css";
import "./page.css";

createRoot(document.getElementById("app")!).render(<App />);
