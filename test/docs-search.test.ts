import test from "node:test";
import assert from "node:assert/strict";
import {
  docsAnchorId,
  extractMarkdownHeadings,
  searchDocsIndex,
  type DocsTopicDefinition
} from "../src/dashboard/docs-search.js";

const markdownBySlug = new Map<string, string>([
  ["cloudflare-verification-setup", `
# Cloudflare Tunnel verification setup

## Step 1: Discord Developer Portal
Set the OAuth redirect URL exactly.

## Step 2: Install and authenticate Cloudflare Tunnel
Create and run the tunnel.

## Step 3: Configure Cloudflare DNS
Add DNS records.

## Step 6: .env configuration
Set VERIFY_PUBLIC_BASE_URL and TRUST_PROXY.
`],
  ["verification-process", "# Verification gate\n\n## Dashboard setup\nCreate the verify page and verified role."],
  ["ticket-setup", "# Ticket setup\n\n## Create a type\nBuild ticket types and panels."],
  ["role-panels", "# Role Panels\n\nReaction roles and self-service role buttons."],
  ["modlogs", "# Logging Setup\n\nServer logs, audit logs, and dashboard changes."],
  ["auto-mod", "# AutoMod Setup\n\nInvite blocker and spam filters."],
  ["custom-commands", "# Commands Setup\n\nCustom commands and action templates."]
]);

const topics: DocsTopicDefinition[] = [
  {
    slug: "cloudflare-verification-setup",
    title: "Cloudflare Verification Setup",
    description: "Set up Cloudflare Tunnel with separate verify/admin hostnames and OAuth.",
    files: ["cloudflare-verification-setup.md"],
    path: "Guides → Cloudflare Verification Setup",
    aliases: ["cloudfare verification setup", "cloudflare tunnel", "oauth redirect"],
    sections: [
      { title: "Discord Developer Portal", hash: "step-1-discord-developer-portal", aliases: ["oauth redirect"] },
      { title: "Cloudflare Tunnel", hash: "step-2-install-and-authenticate-cloudflare-tunnel", aliases: ["cloudflare tunnel", "cloudfare tunnel"] }
    ]
  },
  {
    slug: "verification-process",
    title: "Verification Setup",
    description: "How Discord OAuth member verification works.",
    files: ["verification-process.md"],
    path: "Guides → Verification Setup",
    aliases: ["verification setup", "verify page", "verified role"]
  },
  {
    slug: "ticket-setup",
    title: "Ticket Setup",
    description: "Build a complete ticket workflow.",
    files: ["ticket-setup.md"],
    path: "Guides → Ticket Setup",
    aliases: ["tickets", "requests", "close requests", "ticket close requests"]
  },
  {
    slug: "role-panels",
    title: "Role Panel Setup",
    description: "Self-service reaction role buttons.",
    files: ["role-panels.md"],
    path: "Guides → Role Panel Setup",
    aliases: ["reaction roles", "role panels", "button roles", "dropdown roles", "self roles", "role hierarchy"]
  },
  {
    slug: "modlogs",
    title: "Logging Setup",
    description: "Configure server logging.",
    files: ["modlogs.md"],
    path: "Guides → Logging Setup",
    aliases: ["logging", "logging setup"]
  },
  {
    slug: "auto-mod",
    title: "AutoMod Setup",
    description: "Invite, link, caps, spam, and mention rules.",
    files: ["auto-mod.md"],
    path: "Guides → AutoMod Setup",
    aliases: ["automod", "automod setup"]
  },
  {
    slug: "custom-commands",
    title: "Commands Setup",
    description: "Build custom commands.",
    files: ["custom-commands.md"],
    path: "Guides → Commands Setup",
    aliases: ["commands", "moderation"]
  }
];

function search(query: string) {
  return searchDocsIndex(query, topics, (topic) => markdownBySlug.get(topic.slug) ?? "");
}

test("docs anchors match rendered markdown heading IDs", () => {
  assert.equal(docsAnchorId("Step 6: `.env` configuration"), "step-6-env-configuration");
  assert.ok(extractMarkdownHeadings(markdownBySlug.get("cloudflare-verification-setup") ?? "")
    .some((heading) => heading.hash === "step-2-install-and-authenticate-cloudflare-tunnel"));
});

test("docs search routes Cloudflare and common misspellings to the Cloudflare guide", () => {
  for (const query of ["cloudflare verification setup", "cloudfare verification setup"]) {
    const [result] = search(query);
    assert.equal(result.slug, "cloudflare-verification-setup");
    assert.equal(result.path, "Guides → Cloudflare Verification Setup");
  }
});

test("docs search returns section anchors for setup details", () => {
  assert.equal(search("cloudflare tunnel")[0]?.hash, "step-2-install-and-authenticate-cloudflare-tunnel");
  assert.equal(search("oauth redirect")[0]?.hash, "step-1-discord-developer-portal");
});

test("docs search covers the required feature queries", () => {
  const expected: Record<string, string> = {
    "verification setup": "verification-process",
    "verify page": "verification-process",
    "ticket setup": "ticket-setup",
    "role panels": "role-panels",
    tickets: "ticket-setup",
    requests: "ticket-setup",
    "close requests": "ticket-setup",
    logging: "modlogs",
    "automod setup": "auto-mod",
    automod: "auto-mod",
    commands: "custom-commands",
    "reaction roles": "role-panels",
    "button roles": "role-panels",
    "dropdown roles": "role-panels",
    "self roles": "role-panels",
    "role hierarchy": "role-panels"
  };
  for (const [query, slug] of Object.entries(expected)) {
    assert.equal(search(query)[0]?.slug, slug, query);
  }
});
