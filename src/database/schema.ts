export const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        mod_log_channel_id TEXT,
        announcement_channel_id TEXT,
        ticket_category_id TEXT,
        transcript_channel_id TEXT,
        staff_role_ids TEXT NOT NULL DEFAULT '[]',
        muted_role_id TEXT,
        admin_role_ids TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS branding (
        guild_id TEXT PRIMARY KEY,
        server_name TEXT NOT NULL DEFAULT 'Rapid Bot',
        footer_text TEXT NOT NULL DEFAULT '',
        ticket_panel_title TEXT NOT NULL DEFAULT 'Support Tickets',
        ticket_panel_description TEXT NOT NULL DEFAULT 'Choose a ticket type below to contact the team.',
        ticket_panel_color TEXT NOT NULL DEFAULT '#5865F2',
        ticket_panel_image_url TEXT NOT NULL DEFAULT '',
        announcement_default_color TEXT NOT NULL DEFAULT '#5865F2',
        announcement_default_image_url TEXT NOT NULL DEFAULT '',
        announcement_default_thumbnail_url TEXT NOT NULL DEFAULT '',
        embed_icon_url TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS custom_commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        response TEXT NOT NULL,
        ephemeral INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(guild_id, name)
      );

      CREATE TABLE IF NOT EXISTS ticket_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        emoji TEXT NOT NULL DEFAULT '',
        staff_role_ids TEXT NOT NULL DEFAULT '[]',
        category_id TEXT,
        welcome_message TEXT NOT NULL DEFAULT 'Thanks for contacting us. A staff member will be with you shortly.',
        color TEXT NOT NULL DEFAULT '#5865F2',
        image_url TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        ticket_type_id INTEGER,
        status TEXT NOT NULL DEFAULT 'open',
        claimed_by TEXT,
        opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        closed_at TEXT,
        closed_by TEXT,
        FOREIGN KEY(ticket_type_id) REFERENCES ticket_types(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS announcement_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#5865F2',
        image_url TEXT NOT NULL DEFAULT '',
        thumbnail_url TEXT NOT NULL DEFAULT '',
        footer TEXT NOT NULL DEFAULT '',
        target_channel_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(guild_id, name)
      );

      CREATE TABLE IF NOT EXISTS warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        moderator_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS moderation_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_user_id TEXT,
        moderator_id TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_custom_commands_guild ON custom_commands(guild_id);
      CREATE INDEX IF NOT EXISTS idx_ticket_types_guild ON ticket_types(guild_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guild_id);
      CREATE INDEX IF NOT EXISTS idx_warnings_lookup ON warnings(guild_id, user_id);
    `
  },
  {
    version: 2,
    sql: `
      ALTER TABLE custom_commands ADD COLUMN description TEXT NOT NULL DEFAULT '';
      ALTER TABLE custom_commands ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE custom_commands ADD COLUMN action_type TEXT NOT NULL DEFAULT 'reply_message';
      ALTER TABLE custom_commands ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'everyone';
      ALTER TABLE custom_commands ADD COLUMN allowed_role_ids TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE custom_commands ADD COLUMN blocked_role_ids TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE custom_commands ADD COLUMN allowed_channel_ids TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE custom_commands ADD COLUMN blocked_channel_ids TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE custom_commands ADD COLUMN cooldown_type TEXT NOT NULL DEFAULT 'none';
      ALTER TABLE custom_commands ADD COLUMN cooldown_seconds INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE custom_commands ADD COLUMN reply_visibility TEXT NOT NULL DEFAULT 'public';
      ALTER TABLE custom_commands ADD COLUMN delete_usage INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE custom_commands ADD COLUMN action_config TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE custom_commands ADD COLUMN created_by_user_id TEXT NOT NULL DEFAULT 'local-dashboard';
      ALTER TABLE custom_commands ADD COLUMN updated_by_user_id TEXT NOT NULL DEFAULT 'local-dashboard';

      ALTER TABLE ticket_types ADD COLUMN ping_role_ids TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE ticket_types ADD COLUMN allowed_role_ids TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE ticket_types ADD COLUMN blocked_role_ids TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE ticket_types ADD COLUMN thumbnail_url TEXT NOT NULL DEFAULT '';
      ALTER TABLE ticket_types ADD COLUMN footer_text TEXT NOT NULL DEFAULT '';
      ALTER TABLE ticket_types ADD COLUMN footer_icon_url TEXT NOT NULL DEFAULT '';
      ALTER TABLE ticket_types ADD COLUMN transcript_channel_id TEXT;
      ALTER TABLE ticket_types ADD COLUMN max_open_tickets INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE ticket_types ADD COLUMN naming_format TEXT NOT NULL DEFAULT 'ticket-{username}';
      ALTER TABLE ticket_types ADD COLUMN claim_button_enabled INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE ticket_types ADD COLUMN close_button_enabled INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE ticket_types ADD COLUMN close_reason_required INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE ticket_types ADD COLUMN auto_close_hours INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE tickets ADD COLUMN panel_id INTEGER;
      ALTER TABLE tickets ADD COLUMN close_reason TEXT NOT NULL DEFAULT '';
      ALTER TABLE tickets ADD COLUMN last_activity_at TEXT NOT NULL DEFAULT '';
      UPDATE tickets SET last_activity_at = opened_at WHERE last_activity_at = '';

      CREATE TABLE IF NOT EXISTS ticket_panels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        target_channel_id TEXT,
        title TEXT NOT NULL DEFAULT 'Support Tickets',
        description TEXT NOT NULL DEFAULT 'Choose a ticket type below to contact the team.',
        color TEXT NOT NULL DEFAULT '#5865F2',
        image_url TEXT NOT NULL DEFAULT '',
        thumbnail_url TEXT NOT NULL DEFAULT '',
        footer_text TEXT NOT NULL DEFAULT '',
        footer_icon_url TEXT NOT NULL DEFAULT '',
        display_mode TEXT NOT NULL DEFAULT 'dropdown',
        dropdown_placeholder TEXT NOT NULL DEFAULT 'Choose a ticket type',
        active INTEGER NOT NULL DEFAULT 1,
        panel_kind TEXT NOT NULL DEFAULT 'standard',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(guild_id, name)
      );

      CREATE TABLE IF NOT EXISTS ticket_panel_types (
        panel_id INTEGER NOT NULL,
        ticket_type_id INTEGER NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(panel_id, ticket_type_id),
        FOREIGN KEY(panel_id) REFERENCES ticket_panels(id) ON DELETE CASCADE,
        FOREIGN KEY(ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ticket_panel_children (
        parent_panel_id INTEGER NOT NULL,
        child_panel_id INTEGER NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(parent_panel_id, child_panel_id),
        FOREIGN KEY(parent_panel_id) REFERENCES ticket_panels(id) ON DELETE CASCADE,
        FOREIGN KEY(child_panel_id) REFERENCES ticket_panels(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_ticket_panels_guild ON ticket_panels(guild_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_activity ON tickets(status, last_activity_at);
    `
  },
  {
    version: 3,
    sql: `
      ALTER TABLE custom_commands ADD COLUMN action_sequence TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE custom_commands ADD COLUMN role_ids TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE ticket_types ADD COLUMN request_close_enabled INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE ticket_types ADD COLUMN close_request_delay_seconds INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS welcome_settings (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        channel_id TEXT,
        dm_enabled INTEGER NOT NULL DEFAULT 0,
        dm_content TEXT NOT NULL DEFAULT '',
        dm_embed_enabled INTEGER NOT NULL DEFAULT 0,
        content TEXT NOT NULL DEFAULT '',
        embed_title TEXT NOT NULL DEFAULT '',
        embed_description TEXT NOT NULL DEFAULT '',
        embed_color TEXT NOT NULL DEFAULT '#5865F2',
        embed_image_url TEXT NOT NULL DEFAULT '',
        embed_thumbnail_url TEXT NOT NULL DEFAULT '',
        embed_footer_text TEXT NOT NULL DEFAULT '',
        auto_role_ids TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS anti_raid_settings (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        join_threshold INTEGER NOT NULL DEFAULT 10,
        time_window_seconds INTEGER NOT NULL DEFAULT 60,
        action TEXT NOT NULL DEFAULT 'alert',
        lockdown_duration_seconds INTEGER NOT NULL DEFAULT 300,
        min_account_age_days INTEGER NOT NULL DEFAULT 0,
        block_no_avatar INTEGER NOT NULL DEFAULT 0,
        bypass_role_ids TEXT NOT NULL DEFAULT '[]',
        bypass_user_ids TEXT NOT NULL DEFAULT '[]',
        alert_channel_id TEXT,
        log_channel_id TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS anti_nuke_settings (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        channel_delete_threshold INTEGER NOT NULL DEFAULT 5,
        channel_create_threshold INTEGER NOT NULL DEFAULT 5,
        role_delete_threshold INTEGER NOT NULL DEFAULT 5,
        role_create_threshold INTEGER NOT NULL DEFAULT 5,
        ban_threshold INTEGER NOT NULL DEFAULT 5,
        kick_threshold INTEGER NOT NULL DEFAULT 5,
        webhook_threshold INTEGER NOT NULL DEFAULT 3,
        permission_threshold INTEGER NOT NULL DEFAULT 3,
        bot_add_threshold INTEGER NOT NULL DEFAULT 2,
        admin_role_threshold INTEGER NOT NULL DEFAULT 2,
        time_window_seconds INTEGER NOT NULL DEFAULT 10,
        action TEXT NOT NULL DEFAULT 'alert',
        alert_channel_id TEXT,
        log_channel_id TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS anti_nuke_trusted (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT,
        role_id TEXT
      );

      CREATE TABLE IF NOT EXISTS ticket_close_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        ticket_id INTEGER NOT NULL,
        requested_by TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at TEXT,
        resolved_by TEXT,
        FOREIGN KEY(ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_close_requests_guild ON ticket_close_requests(guild_id);
      CREATE INDEX IF NOT EXISTS idx_close_requests_ticket ON ticket_close_requests(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_nuke_trusted_guild ON anti_nuke_trusted(guild_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_user_open ON tickets(guild_id, user_id, status);
    `
  },
  {
    version: 4,
    sql: `
      ALTER TABLE announcement_templates ADD COLUMN ping_type TEXT NOT NULL DEFAULT 'none';
    `
  }
] as const;
