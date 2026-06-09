import type { TicketCloseRequest } from "../shared/types.js";

export type CloseRequestSource = TicketCloseRequest["requestSource"];

export function closeRequestAudience(source: CloseRequestSource): string {
  return source === "staff"
    ? "the ticket opener or an allowed community member"
    : "ticket staff";
}

export function closeRequestCreationDenial(
  source: CloseRequestSource,
  isStaff: boolean,
  isCommunity: boolean
): string | null {
  if (source === "staff" && !isStaff) {
    return "Only ticket staff can use `/close-request`. If you opened this ticket, use the **Close Request** button instead.";
  }
  if (source === "community" && !isCommunity) {
    return "Only the ticket opener or a member with one of this ticket type's allowed community roles can request staff closure.";
  }
  return null;
}

export function closeRequestDecisionDenial(
  source: CloseRequestSource,
  isStaff: boolean,
  isCommunity: boolean,
  isRequester: boolean
): string | null {
  if (isRequester) {
    return "You cannot accept or deny your own close request. It must be reviewed by the other side.";
  }
  if (source === "community" && !isStaff) {
    return "Only ticket staff can accept or deny a close request made by the ticket opener or community.";
  }
  if (source === "staff" && !isCommunity) {
    return "Only the ticket opener or an allowed community member can accept or deny a close request made by staff.";
  }
  return null;
}
