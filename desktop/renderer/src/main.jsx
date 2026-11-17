// desktop/renderer/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { markPerf } from "./lib/perfMarks.mjs";
import "./styles/main.css";

markPerf("renderer-dom-ready");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
