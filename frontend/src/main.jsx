import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { configureAmplify } from "./config/amplify.js";
import "./styles.css";

configureAmplify();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
