"use client"

import * as React from "react"

import { useControllable } from "@/components/kit/use-controllable"

import "./feed.css"

/**
 * A post as it reads in its platform's feed: the rendering /drafts was
 * rebuilt on (decided on /prototypes/drafts-lab, round 2, "C · Feed"). It is
 * drawn in the platform's look, so it is not kit; its colours and type live
 * in feed.css beside it and nowhere else.
 *
 * Compound, with the platform set once on the column and read by every part:
 *
 * ```tsx
 * <FeedColumn platform="x">
 *   <FeedColumn.Tabs>
 *     <FeedColumn.Tab current>For you</FeedColumn.Tab>
 *     <FeedColumn.Tab>Following</FeedColumn.Tab>
 *   </FeedColumn.Tabs>
 *   <FeedSkeleton />
 *   <FeedThread>
 *     <FeedPost initials="CH">
 *       <FeedPost.Header name="Christer Hagen" handle="christer" time="now" />
 *       <FeedPost.Body>…</FeedPost.Body>
 *       <FeedPost.Actions />
 *     </FeedPost>
 *   </FeedThread>
 *   <FeedSkeleton />
 * </FeedColumn>
 * ```
 *
 * Every part takes a `ref` and spreads the rest of its props onto its root.
 * None renders a button: the platform's actions are a picture here
 * (`aria-hidden`, inert), and the verbs live under the column in the kit.
 */

export type FeedPlatform = "x" | "linkedin" | "instagram"

const PlatformContext = React.createContext<FeedPlatform | null>(null)

function usePlatform(part: string): FeedPlatform {
  const p = React.useContext(PlatformContext)
  if (!p) throw new Error(`${part} must sit inside <FeedColumn>.`)
  return p
}

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ")
}

/* ── FeedColumn ──────────────────────────────────────────────────────── */

export type FeedColumnProps = React.ComponentPropsWithRef<"div"> & {
  /** Whose feed this is drawn as. Every part inside reads it. */
  platform: FeedPlatform
}

function FeedColumnRoot({ platform, className, children, ...rest }: FeedColumnProps) {
  return (
    <PlatformContext value={platform}>
      <div
        data-platform={platform}
        className={cx(platform === "x" ? "xf" : platform === "instagram" ? "ig" : "lf", className)}
        {...rest}
      >
        {children}
      </div>
    </PlatformContext>
  )
}

/** X's column-head tabs. A picture: never focusable, never pressed. */
function FeedTabs({ className, children, ...rest }: React.ComponentPropsWithRef<"div">) {
  return (
    <div aria-hidden className={cx("xf-tabs", className)} {...rest}>
      {children}
    </div>
  )
}

function FeedTab({ current = false, className, children, ...rest }: React.ComponentPropsWithRef<"span"> & { current?: boolean }) {
  return (
    <span className={cx("xf-tab", className)} data-on={current ? "" : undefined} {...rest}>
      {children}
    </span>
  )
}

export const FeedColumn = Object.assign(FeedColumnRoot, { Tabs: FeedTabs, Tab: FeedTab })

/* ── FeedThread ──────────────────────────────────────────────────────── */

/** Where a post stands in a thread, so it draws the connector above and below. */
const ThreadContext = React.createContext<{ above: boolean; below: boolean } | null>(null)

/**
 * Posts joined by the platform's connector, avatar to avatar. Each child is
 * a FeedPost, or a wrapper around one (a BeatBracket): the position reaches
 * the post through context, not props.
 */
export function FeedThread({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children)
  return (
    <>
      {items.map((child, i) => (
        <ThreadContext key={i} value={{ above: i > 0, below: i < items.length - 1 }}>
          {child}
        </ThreadContext>
      ))}
    </>
  )
}

/* ── FeedPost ────────────────────────────────────────────────────────── */

const PostContext = React.createContext<{ initials: string; avatarUrl: string | null } | null>(null)

export type FeedPostProps = React.ComponentPropsWithRef<"div"> & {
  /** The account circle's letters, drawn when there is no photo or it fails to load. */
  initials: string
  /** The connected account's own picture, when the channel gave one. */
  avatarUrl?: string | null
}

/**
 * The account circle: the connected account's picture, or its initials.
 * A platform's picture URL can expire (LinkedIn signs them), so a failed
 * load falls back to the initials rather than a broken image.
 */
function AvatarFace({ initials, avatarUrl }: { initials: string; avatarUrl: string | null }) {
  const [failed, setFailed] = React.useState(false)
  if (!avatarUrl || failed) return <>{initials}</>
  return (
    // A 40px picture from the platform's own CDN: next/image would need
    // every platform host in remotePatterns to resize something this small.
    // oxlint-disable-next-line nextjs/no-img-element
    <img src={avatarUrl} alt="" width={40} height={40} className="feed-avatar-img" onError={() => setFailed(true)} />
  )
}

function FeedPostRoot({ initials, avatarUrl = null, className, children, ...rest }: FeedPostProps) {
  const platform = usePlatform("FeedPost")
  const thread = React.useContext(ThreadContext)
  const value = React.useMemo(() => ({ initials, avatarUrl }), [initials, avatarUrl])
  if (platform === "linkedin") {
    return (
      <PostContext value={value}>
        <div className={cx("lf-card", className)} {...rest}>
          {children}
        </div>
      </PostContext>
    )
  }
  if (platform === "instagram") {
    return (
      <PostContext value={value}>
        <div className={cx("ig-post", className)} {...rest}>
          {children}
        </div>
      </PostContext>
    )
  }
  return (
    <PostContext value={value}>
      <div
        className={cx("xf-post", className)}
        data-thread-above={thread?.above || undefined}
        data-thread-below={thread?.below || undefined}
        {...rest}
      >
        <div className="xf-gutter">
          {thread?.above ? <span aria-hidden className="xf-line-above" /> : null}
          <span aria-hidden className="xf-avatar">
            <AvatarFace initials={initials} avatarUrl={avatarUrl} />
          </span>
          {thread?.below ? <span aria-hidden className="xf-line-below" /> : null}
        </div>
        <div className="xf-main">{children}</div>
      </div>
    </PostContext>
  )
}

export type FeedPostHeaderProps = React.ComponentPropsWithRef<"div"> & {
  /** The display name. */
  name: string
  /** X: the @handle, without the @. */
  handle?: string
  /** LinkedIn: the headline under the name. */
  headline?: string
  /** "now", "2h": when it went out, or would. */
  time?: string
}

function FeedPostHeader({ name, handle, headline, time = "now", className, ...rest }: FeedPostHeaderProps) {
  const platform = usePlatform("FeedPost.Header")
  const post = React.useContext(PostContext)
  if (platform === "instagram") {
    return (
      <div className={cx("ig-head", className)} {...rest}>
        <span aria-hidden className="ig-avatar">
          {post ? <AvatarFace initials={post.initials} avatarUrl={post.avatarUrl} /> : null}
        </span>
        <div className="min-w-0">
          <div className="ig-name">{name}</div>
          {handle ? <div className="ig-dim">{`@${handle.replace(/^@/, "")}`}</div> : null}
        </div>
        <span className="ig-dim">{time}</span>
      </div>
    )
  }
  if (platform === "linkedin") {
    return (
      <div className={cx("lf-head", className)} {...rest}>
        <span aria-hidden className="lf-avatar">
          {post ? <AvatarFace initials={post.initials} avatarUrl={post.avatarUrl} /> : null}
        </span>
        <div className="min-w-0">
          <div className="lf-name">{name}</div>
          {headline ? <div className="lf-dim lf-small truncate">{headline}</div> : null}
          <div className="lf-dim lf-small flex items-center gap-1">
            {time} <span aria-hidden>·</span>
            <svg aria-hidden viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2">
              <circle cx="8" cy="8" r="6.2" />
              <path d="M1.8 8h12.4M8 1.8c1.8 1.7 2.6 3.8 2.6 6.2s-.8 4.5-2.6 6.2M8 1.8C6.2 3.5 5.4 5.6 5.4 8s.8 4.5 2.6 6.2" />
            </svg>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className={cx("xf-head", className)} {...rest}>
      <span className="xf-name">{name}</span>
      {handle ? <span className="xf-dim xf-handle">{`@${handle}`}</span> : null}
      <span className="xf-dim" aria-hidden>
        ·
      </span>
      <span className="xf-dim">{time}</span>
      <span aria-hidden className="xf-more">
        <XIcon d={X_ICONS.more} />
      </span>
    </div>
  )
}

/** Where the words go: the text column of the post (LinkedIn's padded body; X's main column). */
function FeedPostBody({ className, children, ...rest }: React.ComponentPropsWithRef<"div">) {
  const platform = usePlatform("FeedPost.Body")
  return (
    <div className={cx(platform === "linkedin" ? "lf-body" : platform === "instagram" ? "ig-body" : undefined, className)} {...rest}>
      {children}
    </div>
  )
}

/** The platform's action row, without a count on it. A picture: inert and hidden from assistive tech. */
function FeedPostActions({ className, ...rest }: React.ComponentPropsWithRef<"div">) {
  const platform = usePlatform("FeedPost.Actions")
  if (platform === "instagram") return null
  if (platform === "linkedin") {
    return (
      <div aria-hidden className={cx("lf-actions", className)} {...rest}>
        {(Object.keys(LI_ICONS) as (keyof typeof LI_ICONS)[]).map((k) => (
          <span key={k} className="lf-action">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d={LI_ICONS[k]} />
            </svg>
            <span>{k}</span>
          </span>
        ))}
      </div>
    )
  }
  return (
    <div aria-hidden className={cx("xf-actions", className)} {...rest}>
      <span>
        <XIcon d={X_ICONS.reply} />
      </span>
      <span>
        <XIcon d={X_ICONS.repost} />
      </span>
      <span>
        <XIcon d={X_ICONS.like} />
      </span>
      <span>
        <XIcon d={X_ICONS.views} />
      </span>
      <span className="xf-actions-end">
        <XIcon d={X_ICONS.bookmark} />
        <XIcon d={X_ICONS.share} />
      </span>
    </div>
  )
}

/** The platform's own truncation word, set inline after the last shown word: X "Show more", LinkedIn "…more". */
function FeedPostMore({ className, children, ...rest }: React.ComponentPropsWithRef<"span">) {
  const platform = usePlatform("FeedPost.More")
  return (
    <span className={cx("feed-more", className)} {...rest}>
      {children ?? (platform === "x" ? "Show more" : "…more")}
    </span>
  )
}

/** Where the feed stops showing the post, drawn for the writer only. `children` is the line's label. */
function FeedPostFold({ className, children = "The feed cuts here", ...rest }: React.ComponentPropsWithRef<"span">) {
  return (
    <span role="separator" aria-label={typeof children === "string" ? children : undefined} className={cx("feed-fold", className)} {...rest}>
      <span aria-hidden className="feed-fold-rule" />
      <span aria-hidden>{children}</span>
    </span>
  )
}

export type FeedPostFieldProps = Omit<React.ComponentPropsWithRef<"textarea">, "value" | "defaultValue" | "onChange"> & {
  /** Controlled text. */
  value?: string
  /** Uncontrolled starting text. */
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Focus with the caret at the end of the text, without scrolling the page. */
  autoFocus?: boolean
}

/**
 * The post's words as the field: set exactly like the read text (font, size,
 * leading, wrapping, no minimum height), so opening it moves nothing.
 * Controlled (`value` + `onValueChange`) or uncontrolled (`defaultValue`).
 */
function FeedPostField({ value: valueProp, defaultValue = "", onValueChange, autoFocus = false, className, ref, ...rest }: FeedPostFieldProps) {
  const [value, setValue] = useControllable(valueProp, defaultValue, onValueChange)
  const inner = React.useRef<HTMLTextAreaElement | null>(null)
  const setRef = React.useCallback(
    (el: HTMLTextAreaElement | null) => {
      inner.current = el
      if (typeof ref === "function") ref(el)
      else if (ref) ref.current = el
    },
    [ref]
  )
  React.useEffect(() => {
    const el = inner.current
    if (!autoFocus || !el) return
    el.focus({ preventScroll: true })
    el.setSelectionRange(el.value.length, el.value.length)
  }, [autoFocus])
  return <textarea ref={setRef} value={value} onChange={(e) => setValue(e.target.value)} className={cx("feed-text feed-field", className)} {...rest} />
}

export const FeedPost = Object.assign(FeedPostRoot, {
  Header: FeedPostHeader,
  Body: FeedPostBody,
  Actions: FeedPostActions,
  More: FeedPostMore,
  Fold: FeedPostFold,
  Field: FeedPostField,
})

/* ── FeedSkeleton ────────────────────────────────────────────────────── */

/** A neighbour post with no words: avatar, grey bars, the action row. Never fake text. */
export function FeedSkeleton({ className, ...rest }: React.ComponentPropsWithRef<"div">) {
  const platform = usePlatform("FeedSkeleton")
  if (platform === "instagram") {
    return (
      <div aria-hidden className={cx("ig-post ig-skel", className)} {...rest}>
        <span className="xf-bar" style={{ width: "40%" }} />
        <span className="ig-frame ig-frame-skel" />
      </div>
    )
  }
  if (platform === "linkedin") {
    return (
      <div aria-hidden className={cx("lf-card lf-skel", className)} {...rest}>
        <div className="lf-head">
          <span className="lf-avatar" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
            <span className="xf-bar" style={{ width: "32%" }} />
            <span className="xf-bar" style={{ width: "54%" }} />
          </div>
        </div>
        <div className="lf-body flex flex-col gap-2">
          <span className="xf-bar" style={{ width: "92%" }} />
          <span className="xf-bar" style={{ width: "60%" }} />
        </div>
        <FeedPostActions />
      </div>
    )
  }
  return (
    <div aria-hidden className={cx("xf-post xf-skel", className)} {...rest}>
      <div className="xf-gutter">
        <span className="xf-avatar" />
      </div>
      <div className="xf-main">
        <div className="xf-head">
          <span className="xf-bar" style={{ width: "28%" }} />
          <span className="xf-bar" style={{ width: "18%" }} />
        </div>
        <div className="flex flex-col gap-2 pt-1">
          <span className="xf-bar" style={{ width: "94%" }} />
          <span className="xf-bar" style={{ width: "86%" }} />
          <span className="xf-bar" style={{ width: "48%" }} />
        </div>
        <FeedPostActions />
      </div>
    </div>
  )
}

/* ── Icons, drawn in the platforms' form (no logo, no asset) ─────────── */

const X_ICONS = {
  reply: "M4.5 10.5a6.5 6.5 0 0 1 6.5-6.5h2a6.5 6.5 0 0 1 0 13h-1.2L7 20.2V16.4a6.5 6.5 0 0 1-2.5-5.9Z",
  repost: "M4.5 9V7.5A2.5 2.5 0 0 1 7 5h9.5m0 0L14 2.5M16.5 5 14 7.5M19.5 15v1.5A2.5 2.5 0 0 1 17 19H7.5m0 0L10 16.5M7.5 19l2.5 2.5",
  like: "M12 20s-7.5-4.6-7.5-10A4.25 4.25 0 0 1 12 7.3 4.25 4.25 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z",
  views: "M5 20V12M10 20V5M15 20v-9M20 20V8",
  bookmark: "M6.5 4.5h11v15.5L12 16.2l-5.5 3.8V4.5Z",
  share: "M12 3.5V15m0-11.5L7.5 8M12 3.5 16.5 8M4.5 14v4.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V14",
  more: "M5.5 12h.01M12 12h.01M18.5 12h.01",
} as const

function XIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18.75" height="18.75" fill="none" stroke="currentColor" strokeWidth={d === X_ICONS.more ? 3 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

const LI_ICONS = {
  Like: "M7.5 10.5V19.5H4.5V10.5h3Zm0 0 3.6-6.3a1.7 1.7 0 0 1 3.1 1.2l-.7 3.6h4.6a1.9 1.9 0 0 1 1.9 2.2l-1.1 6.6a2 2 0 0 1-2 1.7H7.5",
  Comment: "M4.5 6.5A2 2 0 0 1 6.5 4.5h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11l-4.5 3.5v-3.5h0a2 2 0 0 1-2-2v-8Z",
  Repost: "M7 7.5h10.5l-2.5-2.5M17 16.5H6.5L9 19M17.5 7.5V12M6.5 16.5V12",
  Send: "M20.5 3.5 3.5 10.2l6.8 3.1 3.1 6.8 7.1-16.6ZM10.3 13.3l4.6-4.6",
} as const
