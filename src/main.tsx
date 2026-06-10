import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./index.css";
import { useAssetsStore } from "./stores/assets";

// Rehydrate generated frames and clips from IndexedDB before first paint
// settles; surfaces render skeletons until this resolves.
void useAssetsStore.getState().hydrate();

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
