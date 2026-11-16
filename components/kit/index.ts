/**
 * The kit — plans/029-the-kit.md. Tokens live in app/globals.css under
 * --kit-*; these components use only those.
 */
export { KitRoot } from "./root"
export { KitPage, type KitPageProps } from "./page"
export { Stage, STAGE_STACK, type StageBackdrop } from "./stage"
export { Card, type CardProps, type CardWidth, type Crop } from "./card"
export { List, ListHeading, type ListProps, type ListHeadingProps } from "./list"
export { Window } from "./window"
export { Text, Muted, Lead, type TextProps, type TextTone } from "./text"
export { Mono } from "./mono"
export { Code } from "./code"
export { Rule } from "./rule"
export { Well, type WellProps } from "./well"
export { Tag, Tags, type TagLook } from "./tag"
export { Avatar } from "./avatar"
export { Count, type CountProps } from "./count"
export { LiveDot, type LiveDotProps } from "./live-dot"
export { Skeleton, SkeletonLines, type SkeletonWidth } from "./skeleton"
export { Highlight } from "./highlight"
export { MarginNote, type MarginNoteProps } from "./margin-note"
export { Beats, BeatBracket, type Beat } from "./beats"
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  type ButtonWidth,
} from "./button"
export {
  ButtonLink,
  TextLink,
  TextButton,
  type ButtonLinkProps,
  type ButtonLinkVariant,
  type TextLinkProps,
  type TextButtonProps,
} from "./link"
export { HoldButton, type HoldButtonProps } from "./hold-button"
export { UndoBar, type UndoBarProps } from "./undo-bar"
export { Arrive, type ArriveProps } from "./arrive"
export { useInView } from "./use-in-view"
export { useRevealOnNarrow } from "./use-reveal-on-narrow"
export { useReducedMotion } from "./use-reduced-motion"
export { useModKey } from "./use-mod-key"

// Step 2 — app controls, after Stageshow's hero collage.
export { type AccessibleName } from "./a11y"
export {
  Segmented,
  type SegmentedOption,
  type SegmentedProps,
  type SegmentedSize,
} from "./segmented"
export {
  Tabs,
  TabList,
  Tab,
  TabPanel,
  type TabsProps,
  type TabListProps,
  type TabProps,
  type TabPanelProps,
} from "./tabs"
export { Switch, type SwitchProps } from "./switch"
export { Stepper, type StepperProps, type StepperSize } from "./stepper"
export { SearchField, type SearchFieldProps, type SearchFieldSize } from "./search-field"
export { Field, type FieldProps } from "./field"
export { Input, type InputProps, type InputType } from "./input"
export { Textarea, type TextareaProps } from "./textarea"
export { Checklist, CheckItem, type ChecklistProps, type CheckItemProps } from "./checklist"
export {
  Menu,
  MenuTrigger,
  MenuPanel,
  MenuItem,
  MenuSeparator,
  MenuGroup,
  MenuGroupLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuLinkItem,
  type MenuGroupProps,
  type MenuRadioGroupProps,
  type MenuRadioItemProps,
  type MenuLinkItemProps,
  type MenuProps,
  type MenuTriggerProps,
  type MenuPanelProps,
  type MenuItemProps,
  type MenuItemTone,
} from "./menu"
export {
  Select,
  type SelectOption,
  type SelectProps,
  type SelectSize,
} from "./select"
export { Slider, type SliderProps } from "./slider"
export { IconButton, type IconButtonProps, type IconButtonSize } from "./icon-button"
export {
  ListRow,
  NavRow,
  type ListRowProps,
  type NavRowProps,
  type NavRowDensity,
} from "./list-row"
export { FileChip, type FileChipProps } from "./file-chip"
export { SourceMark, SourceGlyph, type SourceMarkProps, type SourceGlyphProps } from "./source-mark"
export { GlyphTile, type GlyphTileProps } from "./glyph-tile"

// Overlays and feedback (round 2), on Base UI.
export {
  Dialog,
  DialogTrigger,
  DialogPanel,
  DialogFooter,
  DialogClose,
  type DialogProps,
  type DialogTriggerProps,
  type DialogPanelProps,
  type DialogCloseProps,
} from "./dialog"
export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPanel,
  AlertDialogCancel,
  AlertDialogAction,
  type AlertDialogProps,
  type AlertDialogTriggerProps,
  type AlertDialogPanelProps,
  type AlertDialogCancelProps,
  type AlertDialogActionProps,
} from "./alert-dialog"
export {
  Sheet,
  SheetTrigger,
  SheetPanel,
  SheetFooter,
  SheetClose,
  type SheetProps,
  type SheetTriggerProps,
  type SheetPanelProps,
  type SheetCloseProps,
} from "./sheet"
export {
  Popover,
  PopoverTrigger,
  PopoverPanel,
  PopoverDescription,
  type PopoverProps,
  type PopoverTriggerProps,
  type PopoverPanelProps,
} from "./popover"
export { Tooltip, type TooltipProps } from "./tooltip"
export { ToastProvider, useToast, type ToastAction, type ToastOptions } from "./toast"
export {
  Disclosure,
  Accordion,
  AccordionItem,
  type DisclosureProps,
  type AccordionProps,
  type AccordionItemProps,
} from "./disclosure"
export { EmptyState, type EmptyStateProps } from "./empty-state"
export { Progress, type ProgressProps } from "./progress"
export { Kbd, type KbdProps, type KbdKey } from "./kbd"

// ui-sdk based (beta): behaviours Base UI does not cover. Each file says why
// in its header; none of them mixes in Base UI.
export {
  CommandPalette,
  type CommandPaletteProps,
  type CommandPaletteGroup,
  type CommandPaletteItem,
  type CommandPaletteStatus,
} from "./command-palette"
export { TokenInput, type TokenInputProps } from "./token-input"
export { Calendar, type CalendarProps, type CalendarSlots, type CalendarStatus } from "./calendar"
export { DateTimePicker, type DateTimePickerProps, type DateTimeValue } from "./date-time-picker"
export { Reorderable, type ReorderableProps, type ReorderableItemState } from "./reorderable"
export { Tree, type TreeProps, type TreeNode, type TreeStatus } from "./tree"

// Conversation (Studio, 2026-11-16): the chatbot template's structure on kit
// tokens. MessageList is on @shadcn/react/message-scroller (already a dep).
export {
  MessageList,
  MessageListItem,
  type MessageListProps,
  type MessageListItemProps,
} from "./message-list"
export { Composer, type ComposerProps, type ComposerSubmit } from "./composer"
export { Choices, Choice, type ChoicesProps, type ChoiceProps } from "./choices"

// Setup pages (Channels, Rhythm), 2026-11-16: a button that leaves the app
// (OAuth consent), and named wrappers for Input's time and date types.
export {
  ButtonAnchor,
  type ButtonAnchorProps,
  type ButtonAnchorVariant,
} from "./button-anchor"
export {
  TimeInput,
  DateInput,
  type TimeInputProps,
  type DateInputProps,
} from "./time-input"

// Workspace (2026-11-16, docs/design/workspace.md): a dense working surface
// (toolbar, DataList, panels), promoted from /prototypes/workspace-lab after
// the owner picked Table. Base UI for FilterMenu; ui-sdk for DataList only.
export {
  Toolbar,
  ToolbarGroup,
  ToolbarDivider,
  ToolbarTitle,
  type ToolbarProps,
  type ToolbarSize,
  type ToolbarGroupProps,
  type ToolbarTitleProps,
} from "./toolbar"
export { KeyBar, FootBar, type KeyBarProps, type KeyBarItem, type FootBarProps } from "./key-bar"
export { FilterMenu, type FilterMenuProps, type FilterOption } from "./filter-menu"
export {
  DataList,
  DataListTitle,
  DataListMeta,
  DataListMono,
  DataListEmpty,
  DATA_LIST_ROW,
  revealDataListRow,
  type DataListProps,
  type DataListColumn,
  type DataListGroup,
  type DataListStatus,
  type DataListTitleProps,
  type DataListEmptyProps,
} from "./data-list"
export {
  Panel,
  PanelHeader,
  PanelBody,
  type PanelProps,
  type PanelHeaderProps,
  type PanelBodyProps,
} from "./panel"
export { StatusPill, type StatusPillProps, type StatusPillStatus } from "./status-pill"
export { Announcer, useAnnounce, type AnnouncerProps } from "./announcer"
export { WorkspacePage, WorkspacePanes, type WorkspacePageProps } from "./workspace-page"
export { useLetterKeys, type LetterKeyHandler, type LetterKeyMap } from "./use-letter-keys"
export { ICON_DENSE, ICON_DENSE_CHEVRON } from "./control-styles"
