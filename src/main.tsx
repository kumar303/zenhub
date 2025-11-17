/**
 * IMPORTANT: Follow all guidelines in AGENTS.md before making changes.
 * Run tests, typecheck, and deploy after every change.
 */

import { render } from "preact";
import { App } from "./App";
import "./index.css";

render(<App />, document.getElementById("app")!);
