import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { initCloudSync, restoreSession } from "./cloud/sync";
import App from "./App";
import "./index.css";
import { useAssetsStore } from "./stores/assets";

// Rehydrate generated frames and clips from IndexedDB before first paint
// settles; surfaces render skeletons until this resolves.
void useAssetsStore.getState().hydrate();

// Wire the cloud layer into the stores (asset upload/download hooks, project
// push subscription), then attempt a best-effort silent session restore when
// the user previously chose Drive. Neither blocks first paint.
initCloudSync();
void restoreSession();

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

// Vite's BASE_URL carries the GitHub Pages subpath in production builds.
const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

createRoot(container).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
