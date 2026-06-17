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
        server_name TEXT NOT NULL DEFAULT 'Odyssey Bot',
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
  },
  {
    version: 5,
    sql: `
      UPDATE ticket_close_requests
      SET status = 'denied', resolved_at = CURRENT_TIMESTAMP, resolved_by = 'migration'
      WHERE status = 'pending'
        AND id NOT IN (
          SELECT MAX(id) FROM ticket_close_requests
          WHERE status = 'pending'
          GROUP BY guild_id, ticket_id
        );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_close_requests_one_pending
      ON ticket_close_requests(guild_id, ticket_id)
      WHERE status = 'pending';
    `
  },
  {
    version: 6,
    sql: `
      CREATE TABLE IF NOT EXISTS anti_role_settings (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        protected_role_ids TEXT NOT NULL DEFAULT '[]',
        trusted_user_ids TEXT NOT NULL DEFAULT '[]',
        trusted_role_ids TEXT NOT NULL DEFAULT '[]',
        action TEXT NOT NULL DEFAULT 'log',
        mass_change_threshold INTEGER NOT NULL DEFAULT 4,
        time_window_seconds INTEGER NOT NULL DEFAULT 20,
        log_channel_id TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS auto_mod_settings (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        block_invites INTEGER NOT NULL DEFAULT 0,
        block_suspicious_links INTEGER NOT NULL DEFAULT 0,
        block_caps INTEGER NOT NULL DEFAULT 0,
        block_spam INTEGER NOT NULL DEFAULT 0,
        block_mass_mentions INTEGER NOT NULL DEFAULT 0,
        caps_percentage INTEGER NOT NULL DEFAULT 75,
        spam_threshold INTEGER NOT NULL DEFAULT 4,
        mention_threshold INTEGER NOT NULL DEFAULT 5,
        action TEXT NOT NULL DEFAULT 'delete',
        timeout_minutes INTEGER NOT NULL DEFAULT 10,
        ignored_channel_ids TEXT NOT NULL DEFAULT '[]',
        ignored_role_ids TEXT NOT NULL DEFAULT '[]',
        ignored_user_ids TEXT NOT NULL DEFAULT '[]',
        log_channel_id TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS role_panels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        channel_id TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#5865F2',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(guild_id, name)
      );

      CREATE TABLE IF NOT EXISTS role_panel_roles (
        panel_id INTEGER NOT NULL,
        role_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(panel_id, role_id),
        FOREIGN KEY(panel_id) REFERENCES role_panels(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sticky_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        content TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        min_interval_seconds INTEGER NOT NULL DEFAULT 30,
        last_message_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(guild_id, channel_id)
      );

      CREATE TABLE IF NOT EXISTS scheduled_announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        announcement_template_id INTEGER NOT NULL,
        channel_id TEXT NOT NULL,
        ping_type TEXT NOT NULL DEFAULT 'none',
        schedule_type TEXT NOT NULL DEFAULT 'once',
        next_run_at TEXT NOT NULL,
        interval_minutes INTEGER,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(guild_id, name),
        FOREIGN KEY(announcement_template_id) REFERENCES announcement_templates(id) ON DELETE CASCADE
      );

      ALTER TABLE tickets ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';

      CREATE INDEX IF NOT EXISTS idx_role_panels_guild ON role_panels(guild_id);
      CREATE INDEX IF NOT EXISTS idx_sticky_messages_guild ON sticky_messages(guild_id);
      CREATE INDEX IF NOT EXISTS idx_scheduled_due ON scheduled_announcements(enabled, next_run_at);
    `
  },
  {
    version: 7,
    sql: `
      ALTER TABLE ticket_close_requests
      ADD COLUMN request_source TEXT NOT NULL DEFAULT 'community';
    `
  },
  {
    version: 8,
    sql: `
      ALTER TABLE announcement_templates
      ADD COLUMN output_mode TEXT NOT NULL DEFAULT 'embed';

      UPDATE branding
      SET server_name = 'Odyssey Bot'
      WHERE server_name = 'Rapid Bot';
    `
  },
  {
    version: 9,
    sql: `
      ALTER TABLE auto_mod_settings
      ADD COLUMN always_block_discord_invites INTEGER NOT NULL DEFAULT 1;

      ALTER TABLE auto_mod_settings
      ADD COLUMN link_channel_rules TEXT NOT NULL DEFAULT '[]';

      CREATE TABLE IF NOT EXISTS social_promotion_settings (
        guild_id TEXT PRIMARY KEY,
        output_mode TEXT NOT NULL DEFAULT 'embed',
        title TEXT NOT NULL DEFAULT 'Follow our socials',
        description TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#5865F2',
        thumbnail_url TEXT NOT NULL DEFAULT '',
        image_url TEXT NOT NULL DEFAULT '',
        target_channel_id TEXT,
        links TEXT NOT NULL DEFAULT '[]',
        member_entries TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `
  },
  {
    version: 10,
    sql: `
      CREATE TABLE IF NOT EXISTS verification_settings (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        verified_role_id TEXT,
        action TEXT NOT NULL DEFAULT 'flag',
        log_channel_id TEXT,
        min_account_age_days INTEGER NOT NULL DEFAULT 0,
        min_server_days INTEGER NOT NULL DEFAULT 0,
        vpn_check_enabled INTEGER NOT NULL DEFAULT 0,
        vpn_fail_closed INTEGER NOT NULL DEFAULT 0,
        device_check_enabled INTEGER NOT NULL DEFAULT 0,
        record_retention_hours INTEGER NOT NULL DEFAULT 168,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS verification_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS verification_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'flagged',
        reason_codes TEXT NOT NULL DEFAULT '[]',
        risk_score INTEGER NOT NULL DEFAULT 0,
        device_hash TEXT,
        account_created_at TEXT,
        server_joined_at TEXT,
        vpn_detected INTEGER,
        verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_verification_links_hash ON verification_links(token_hash);
      CREATE INDEX IF NOT EXISTS idx_verification_records_guild ON verification_records(guild_id, verified_at);
    `
  },
  {
    version: 11,
    sql: `
      ALTER TABLE welcome_settings ADD COLUMN goodbye_enabled INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE welcome_settings ADD COLUMN goodbye_channel_id TEXT;
      ALTER TABLE welcome_settings ADD COLUMN goodbye_content TEXT NOT NULL DEFAULT '';
      ALTER TABLE welcome_settings ADD COLUMN goodbye_embed_enabled INTEGER NOT NULL DEFAULT 0;
    `
  },
  {
    version: 12,
    sql: `
      ALTER TABLE branding ADD COLUMN accent_color TEXT NOT NULL DEFAULT '#7785FF';
      ALTER TABLE branding ADD COLUMN ticket_button_style TEXT NOT NULL DEFAULT 'secondary';
    `
  },
  {
    version: 13,
    sql: `
      ALTER TABLE auto_mod_settings ADD COLUMN mention_spam_threshold INTEGER NOT NULL DEFAULT 3;
      ALTER TABLE auto_mod_settings ADD COLUMN mention_window_seconds INTEGER NOT NULL DEFAULT 30;

      ALTER TABLE welcome_settings ADD COLUMN boost_enabled INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE welcome_settings ADD COLUMN boost_channel_id TEXT;
      ALTER TABLE welcome_settings ADD COLUMN boost_message TEXT NOT NULL DEFAULT 'Thank you {user} for boosting {server}! We now have {boostCount} boosts and are at {tier}.';
      ALTER TABLE welcome_settings ADD COLUMN auto_roles_enabled INTEGER NOT NULL DEFAULT 0;
      UPDATE welcome_settings
      SET auto_roles_enabled = 1
      WHERE enabled = 1 AND auto_role_ids <> '[]';
    `
  },
  {
    version: 14,
    sql: `
      CREATE TABLE IF NOT EXISTS logging_settings (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        channel_id TEXT,
        members INTEGER NOT NULL DEFAULT 1,
        messages INTEGER NOT NULL DEFAULT 1,
        voice INTEGER NOT NULL DEFAULT 1,
        channels INTEGER NOT NULL DEFAULT 1,
        roles INTEGER NOT NULL DEFAULT 1,
        server INTEGER NOT NULL DEFAULT 1,
        invites INTEGER NOT NULL DEFAULT 1,
        threads INTEGER NOT NULL DEFAULT 1,
        moderation INTEGER NOT NULL DEFAULT 1,
        dashboard INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      UPDATE branding
      SET accent_color = '#C58B4B'
      WHERE UPPER(accent_color) IN ('#7785FF', '#5865F2');
    `
  },
  {
    version: 15,
    sql: `
      ALTER TABLE verification_settings ADD COLUMN verification_channel_id TEXT;
      ALTER TABLE verification_settings ADD COLUMN verification_channel_name TEXT NOT NULL DEFAULT 'verify';
      ALTER TABLE verification_settings ADD COLUMN verification_embed_message_id TEXT;
      ALTER TABLE verification_settings ADD COLUMN embed_title TEXT NOT NULL DEFAULT 'Verify to Access the Server';
      ALTER TABLE verification_settings ADD COLUMN embed_description TEXT NOT NULL DEFAULT 'Click the button below to verify your Discord account. Once verified, you will receive the community role and unlock the rest of the server.';
      ALTER TABLE verification_settings ADD COLUMN embed_color TEXT NOT NULL DEFAULT '#C58B4B';
      ALTER TABLE verification_settings ADD COLUMN button_text TEXT NOT NULL DEFAULT 'Verify Me';
      ALTER TABLE verification_settings ADD COLUMN success_message TEXT NOT NULL DEFAULT 'Verification passed. You can return to Discord.';
      ALTER TABLE verification_settings ADD COLUMN failure_message TEXT NOT NULL DEFAULT 'Verification did not meet this server''s requirements. Contact server staff if you need help.';
      ALTER TABLE verification_settings ADD COLUMN public_channel_ids TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE verification_settings ADD COLUMN public_category_ids TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE verification_settings ADD COLUMN hidden_channel_ids TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE verification_settings ADD COLUMN hidden_category_ids TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE verification_settings ADD COLUMN lock_all_channels INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE verification_settings ADD COLUMN auto_create_channel INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE verification_settings ADD COLUMN lock_verification_channel INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE verification_settings ADD COLUMN update_embed_on_setup INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE verification_settings ADD COLUMN apply_permissions_immediately INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE verification_settings ADD COLUMN permissions_applied INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE verification_settings ADD COLUMN last_setup_at TEXT;
      ALTER TABLE verification_settings ADD COLUMN updated_by TEXT;

      CREATE TABLE IF NOT EXISTS verification_permission_backups (
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        target_type INTEGER NOT NULL,
        allow_bits TEXT NOT NULL DEFAULT '0',
        deny_bits TEXT NOT NULL DEFAULT '0',
        existed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (guild_id, channel_id, target_id)
      );
      CREATE INDEX IF NOT EXISTS idx_verification_permission_backups_guild
        ON verification_permission_backups(guild_id);
    `
  },
  {
    version: 16,
    sql: `
      ALTER TABLE role_panels ADD COLUMN layout TEXT NOT NULL DEFAULT 'buttons';
      ALTER TABLE role_panels ADD COLUMN max_selected_per_category INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE role_panels ADD COLUMN remove_role_on_select INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE role_panels ADD COLUMN required_role_id TEXT;
      ALTER TABLE role_panels ADD COLUMN message_id TEXT;
      ALTER TABLE role_panels ADD COLUMN log_channel_id TEXT;

      ALTER TABLE role_panel_roles ADD COLUMN label TEXT NOT NULL DEFAULT '';
      ALTER TABLE role_panel_roles ADD COLUMN description TEXT NOT NULL DEFAULT '';
      ALTER TABLE role_panel_roles ADD COLUMN emoji TEXT NOT NULL DEFAULT '';
      ALTER TABLE role_panel_roles ADD COLUMN category TEXT NOT NULL DEFAULT 'General';
      ALTER TABLE role_panel_roles ADD COLUMN required_role_id TEXT;

      ALTER TABLE verification_records ADD COLUMN reviewed_by TEXT;
      ALTER TABLE verification_records ADD COLUMN reviewed_at TEXT;
      ALTER TABLE verification_records ADD COLUMN staff_note TEXT NOT NULL DEFAULT '';

      CREATE TABLE IF NOT EXISTS moderation_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        case_number INTEGER NOT NULL,
        target_user_id TEXT NOT NULL,
        moderator_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        duration_seconds INTEGER,
        evidence_url TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(guild_id, case_number)
      );
      CREATE INDEX IF NOT EXISTS idx_moderation_cases_guild ON moderation_cases(guild_id, case_number DESC);
      CREATE INDEX IF NOT EXISTS idx_moderation_cases_target ON moderation_cases(guild_id, target_user_id);

      CREATE TABLE IF NOT EXISTS giveaways (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT,
        prize TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        winners_count INTEGER NOT NULL DEFAULT 1,
        ends_at TEXT NOT NULL,
        required_role_id TEXT,
        booster_bonus_entries INTEGER NOT NULL DEFAULT 0,
        bonus_role_id TEXT,
        bonus_role_entries INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft',
        winner_user_ids TEXT NOT NULL DEFAULT '[]',
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_giveaways_guild ON giveaways(guild_id, status, ends_at);

      CREATE TABLE IF NOT EXISTS giveaway_entries (
        giveaway_id INTEGER NOT NULL,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        entries INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(giveaway_id, user_id),
        FOREIGN KEY(giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_giveaway_entries_guild ON giveaway_entries(guild_id, giveaway_id);

      CREATE TABLE IF NOT EXISTS ticket_transcripts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        ticket_id INTEGER NOT NULL,
        channel_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        opener_id TEXT NOT NULL,
        closed_by TEXT NOT NULL,
        close_reason TEXT NOT NULL DEFAULT '',
        message_count INTEGER NOT NULL DEFAULT 0,
        transcript_json TEXT NOT NULL DEFAULT '[]',
        transcript_text TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_ticket_transcripts_guild ON ticket_transcripts(guild_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ticket_transcripts_ticket ON ticket_transcripts(guild_id, ticket_id);
    `
  }
] as const;
