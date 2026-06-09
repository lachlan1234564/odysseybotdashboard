import type { CustomCommand, CustomCommandActionType } from "./types.js";

const trustedActionTypes = new Set<CustomCommandActionType>([
  "send_channel",
  "add_role",
  "remove_role",
  "add_roles",
  "remove_roles",
  "toggle_role",
  "post_ticket_panel",
  "send_announcement",
  "lock_channel",
  "unlock_channel",
  "rename_channel",
  "move_channel",
  "add_user_to_channel",
  "remove_user_from_channel",
  "timeout_user",
  "remove_timeout",
  "kick_user",
  "ban_user",
  "unban_user",
  "purge_messages",
  "log_to_mod"
]);

export function customCommandNeedsTrustedAccess(
  actionType: CustomCommandActionType,
  actionConfig: Pick<CustomCommand["actionConfig"], "actionSequence">
): boolean {
  if (trustedActionTypes.has(actionType)) return true;
  return actionType === "action_sequence"
    && actionConfig.actionSequence.some((item) => trustedActionTypes.has(item.actionType));
}
