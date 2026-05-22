import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// ─── Rate Limiting (SRS FR-SEC-02) ───────────────────────────────────────────
const IS_TEST = process.env.NODE_ENV !== "production";
const noopLimiter = rateLimit({ windowMs: 1000, max: 999999 });

const globalLimiter = IS_TEST ? noopLimiter : rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  skip: (req) => req.path === "/api/health",
});

const authLimiter = IS_TEST ? noopLimiter : rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registration attempts from this IP, please try again after an hour." },
});

const quizLimiter = IS_TEST ? noopLimiter : rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many quiz attempts. Please slow down." },
});

const uploadLimiter = IS_TEST ? noopLimiter : rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Upload limit reached. Maximum 5 uploads per hour." },
});

const passwordLimiter = IS_TEST ? noopLimiter : rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password change attempts. Please try again later." },
});

const resendVerificationLimiter = IS_TEST ? noopLimiter : rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many resend attempts. Please wait an hour before requesting another verification email." },
  keyGenerator: (req) => {
    const body = req.body as { email?: string };
    return `resend_${(body?.email ?? "unknown").toLowerCase()}`;
  },
  validate: { xForwardedForHeader: false },
});

const loginLimiter = IS_TEST ? noopLimiter : rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts from this IP. Please try again in 15 minutes." },
  skipSuccessfulRequests: true,
});

const forgotPasswordLimiter = IS_TEST ? noopLimiter : rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password reset requests. Please try again in an hour." },
  keyGenerator: (req) => {
    const body = req.body as { email?: string };
    return `forgot_${(body?.email ?? "unknown").toLowerCase()}`;
  },
  validate: { xForwardedForHeader: false },
});
// ─────────────────────────────────────────────────────────────────────────────

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(globalLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/forgot-password", forgotPasswordLimiter);
app.use("/api/auth/change-password", passwordLimiter);
app.use("/api/auth/resend-verification", resendVerificationLimiter);
app.use("/api/notes/upload-url", uploadLimiter);
app.use("/api/profile/upload-url", uploadLimiter);

app.set("rateLimiters", { quizLimiter });

app.use("/api", router);

export default app;
