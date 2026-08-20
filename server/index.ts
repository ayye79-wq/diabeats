import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { seedIfEmpty } from "./seed";
import { ensureSecuritySchema } from "./db";
import * as fs from "fs";
import * as path from "path";

const app = express();
// Replit forwards public traffic through a local reverse proxy. Trust that one
// local hop so Express can normalize the client address, but do not trust a
// raw forwarding header from a direct network caller.
app.set("trust proxy", "loopback");
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      const developmentDomain = process.env.REPLIT_DEV_DOMAIN;
      origins.add(`https://${developmentDomain}`);
      const [replId, ...domainParts] = developmentDomain.split(".");
      if (replId && domainParts.length > 0) {
        origins.add(`https://${replId}.expo.${domainParts.join(".")}`);
      }
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    const origin = req.header("origin");

    // Allow localhost origins for Expo web development (any port)
    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: "20mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      if (path !== "/api/auth/session") {
        capturedJsonResponse = bodyJson;
      }
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: "ios" | "android", res: Response) {
  const manifestPath =
    platform === "ios"
      ? path.resolve(process.cwd(), "static-build", "ios", "manifest.json")
      : path.resolve(process.cwd(), "static-build", "android", "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  const privacyPath = path.resolve(process.cwd(), "server", "templates", "privacy.html");
  const privacyHtml = fs.readFileSync(privacyPath, "utf-8");

  const adminFeedbackPath = path.resolve(process.cwd(), "server", "templates", "admin-feedback.html");
  const adminFeedbackHtml = fs.readFileSync(adminFeedbackPath, "utf-8");

  app.get("/robots.txt", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/plain");
    res.status(200).send(
      `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /qr\nDisallow: /api/\nSitemap: https://diabeatsapp.com/sitemap.xml\n`
    );
  });

  app.get("/sitemap.xml", (_req: Request, res: Response) => {
    const today = new Date().toISOString().split("T")[0];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://diabeatsapp.com/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://diabeatsapp.com/privacy</loc>
    <lastmod>${today}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>`;
    res.setHeader("Content-Type", "application/xml");
    res.status(200).send(xml);
  });

  app.get("/privacy", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(privacyHtml);
  });

  app.get("/admin/feedback", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(adminFeedbackHtml);
  });

  app.get("/qr", (_req: Request, res: Response) => {
    const qrHtml = fs.readFileSync(path.resolve(process.cwd(), "server", "templates", "qr.html"), "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(qrHtml);
  });

  log("Serving static Expo files with dynamic manifest routing");

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));

  const staticBuildDir = path.resolve(process.cwd(), "static-build");
  const staticBuildIndex = path.resolve(staticBuildDir, "index.html");

  // Serve Expo static assets (_expo/, favicon.ico, etc.) at root level
  app.use(express.static(staticBuildDir));

  // /app and /app/* all serve index.html — Expo Router handles in-app navigation
  app.get("/app", (req: Request, res: Response, next: NextFunction) => {
    if (fs.existsSync(staticBuildIndex)) {
      return res.sendFile(staticBuildIndex);
    }
    next();
  });

  app.get("/app/*splat", (req: Request, res: Response, next: NextFunction) => {
    if (fs.existsSync(staticBuildIndex)) {
      return res.sendFile(staticBuildIndex);
    }
    next();
  });

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

(async () => {
  try {
    setupCors(app);
    setupBodyParsing(app);
    setupRequestLogging(app);

    configureExpoAndLanding(app);
    await ensureSecuritySchema();

    try {
      await seedIfEmpty();
    } catch (seedErr) {
      console.error("DB seed failed (non-fatal, continuing):", seedErr);
    }

    const server = await registerRoutes(app);

    setupErrorHandler(app);

    const port = parseInt(process.env.PORT || "5000", 10);
    server.listen(
      {
        port,
        host: "0.0.0.0",
        reusePort: true,
      },
      () => {
        log(`express server serving on port ${port}`);
      },
    );
  } catch (fatalErr) {
    console.error("Fatal startup error:", fatalErr);
    process.exit(1);
  }
})();
