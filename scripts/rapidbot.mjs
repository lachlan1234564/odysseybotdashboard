#!/usr/bin/env node

import { spawn } from "node:child_process";

const command = process.argv[2] ?? "help";
const scripts = {
  dashboard: "dashboard",
  bot: "bot",
  dev: "dev",
  deploy: "deploy:commands",
  setup: "setup",
  db: "db:setup"
};

if (command === "help" || !scripts[command]) {
  console.log("Usage: rapidbot <dashboard|bot|dev|deploy|setup|db>");
  process.exit(command === "help" ? 0 : 1);
}

const child = spawn("pnpm", [scripts[command]], {
  cwd: new URL("..", import.meta.url),
  stdio: "inherit",
  shell: process.platform === "win32"
});

child.on("exit", (code) => process.exit(code ?? 1));
