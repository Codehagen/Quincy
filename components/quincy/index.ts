/**
 * Quincy cards — the product components built from the kit (plans/030).
 * Each family appends its own exports; import from `@/components/quincy`.
 */

// Drafts family — docs/design/quincy-drafts.md
export {
  DraftCard,
  DraftCardHeader,
  DraftCardBody,
  DraftCardNotice,
  DraftCardActions,
  type DraftCardProps,
  type DraftCardHeaderProps,
  type DraftCardActionsProps,
} from "./draft-card"
export {
  ScheduledPost,
  type ScheduledPostProps,
  type ScheduledPostMove,
} from "./scheduled-post"
export {
  SlotCell,
  slotState,
  type SlotCellProps,
  type SlotMedian,
  type SlotState,
  type SlotTiming,
} from "./slot-cell"
export {
  PostResult,
  AgainstMedian,
  type PostResultProps,
  type AgainstMedianProps,
} from "./post-result"

// Riff and conversation family — docs/design/quincy-riffs.md, quincy-chat.md
export {
  RiffCard,
  AngleTabs,
  pickAngle,
  riffTitle,
  ideasFrom,
  sourcePhrase,
  dismissedSentence,
  writesSentence,
  angleTabLabels,
  type RiffCardProps,
  type AngleTabsProps,
  type AngleReading,
  type DraftRefusal,
} from "./riff-card"
export { ProvenanceMark, type ProvenanceMarkProps } from "./provenance-mark"
export {
  QuincyReply,
  ReplyText,
  ReplyQuote,
  ReplyActions,
  ReplyFailed,
  YourTurn,
  type QuincyReplyProps,
  type ReplyTextProps,
  type ReplyQuoteProps,
  type ReplyFailedProps,
  type YourTurnProps,
} from "./quincy-reply"
export {
  QuincyAsks,
  type QuincyAsksProps,
  type AskAnswer,
  type AskResult,
} from "./quincy-asks"
export {
  EmptyState,
  EmptyStarters,
  type EmptyStateProps,
  type EmptyStartersProps,
  type Starter,
} from "./empty-state"

// The app frame — docs/design/app-shell.md
export { AppShell, ConversationHistory, type AppShellProps } from "./shell/app-shell"
export { AppSidebar, type AppSidebarProps } from "./shell/app-sidebar"
export { NAV, SETUP_NAV, ACCOUNT_NAV, isActive, type NavItem } from "./shell/nav"

// Studio conversation — docs/design/quincy-chat.md, "Studio"
export { QuincyWork, type QuincyWorkProps } from "./quincy-work"
export {
  ChatDraft,
  ChatDraftProvider,
  type ChatDraftProps,
  type ChatDraftProviderProps,
} from "./chat-draft"
export { SourceCard, type SourceCardProps } from "./source-card"
export {
  QuincyGreeting,
  QuincyGreetingPrelude,
  type QuincyGreetingProps,
} from "./quincy-greeting"
