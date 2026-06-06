import crypto from "node:crypto";
import path from "node:path";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import open from "open";
import { ZodError } from "zod";
import { loadDashboardConfig, resolveUploadsPath } from "../shared/config.js";
import { dashboardApi } from "./api.js";

const config = loadDashboardConfig();
const app = express();
const publicPath = path.join(config.projectRoot, "src/dashboard/public");
const uploadsPath = resolveUploadsPath(config.UPLOADS_DIR);
const sessionSecret = crypto
  .createHash("sha256")
  .update(`${config.DASHBOARD_PASSWORD}:${config.DISCORD_CLIENT_ID}`)
  .digest("hex");

app.disable("x-powered-by");
if (config.NODE_ENV === "production") app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      "default-src": ["'self'"],
      "img-src": ["'self'", "https:", "data:"],
      "style-src": ["'self'"],
      "script-src": ["'self'"]
    }
  }
}));
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));
app.use(express.json({ limit: "250kb" }));
app.use(session({
  name: "rapidbot.sid",
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: config.NODE_ENV === "production",
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.use("/api", dashboardApi);
app.use("/uploads", express.static(uploadsPath, {
  fallthrough: false,
  immutable: true,
  maxAge: "1d"
}));
app.use(express.static(publicPath, { extensions: ["html"] }));

app.get("/", (_req, res) => res.sendFile(path.join(publicPath, "index.html")));
app.get("/docs", (_req, res) => res.sendFile(path.join(publicPath, "index.html")));
app.get("/help", (_req, res) => res.sendFile(path.join(publicPath, "index.html")));
app.get("/login", (_req, res) => res.sendFile(path.join(publicPath, "login.html")));

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    const fields = Object.fromEntries(error.issues.map((issue) => [issue.path.join("."), issue.message]));
    res.status(400).json({
      error: error.issues[0]?.message ?? "Please check the highlighted fields.",
      fields
    });
    return;
  }
  if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
    res.status(409).json({ error: "An item with that name already exists." });
    return;
  }
  if (error && typeof error === "object" && "code" in error && error.code === "23505") {
    res.status(409).json({ error: "An item with that name already exists." });
    return;
  }
  console.error("Dashboard request failed:", error);
  res.status(500).json({ error: "The dashboard could not complete that request." });
});

const port = config.PORT ?? config.DASHBOARD_PORT;
const host = config.PORT ? "0.0.0.0" : config.DASHBOARD_HOST;
const displayHost = host === "0.0.0.0" ? "localhost" : host;
const url = `http://${displayHost}:${port}`;
app.listen(port, host, async () => {
  console.log(`Rapid Bot dashboard listening on ${host}:${port}`);
  if (process.argv.includes("--open") && config.NODE_ENV !== "production") {
    await open(url).catch((error) => console.error("Could not open the browser:", error));
  }
});
