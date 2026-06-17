import "express-session";

declare module "express-session" {
  interface SessionData {
    authenticated: boolean;
    selectedGuildId?: string;
    verificationTokenHash?: string;
    verificationOAuthState?: string;
    verificationGuildId?: string;
  }
}
