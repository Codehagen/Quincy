/**
 * The real corpus, not fixtures.
 *
 * 57 posts pulled from `source_item` on 2026-08-09 — every row `lib/corpus-x.ts`
 * has imported for this tenant, with the `public_metrics` blob it already asks X
 * for at line 208. Nothing here is invented, which is the point: a prototype
 * fed pretty numbers makes every variant look fine and hides the decision.
 *
 * It carries its own worst content on purpose:
 *   - "Im back baby ✨" — 14 characters, and 850 impressions
 *   - two posts with the identical body "Repo 🔗" that did 4,247 and 743
 *   - 300-character bodies that have to truncate somewhere sensible
 *   - a 74× outlier that breaks any linear axis
 */

export type Post = {
  id: string
  body: string
  at: string
  impr: number
  likes: number
  replies: number
  marks: number
}

export const POSTS: Post[] = [
  { id: "2008805860877742355", at: "2026-01-07", impr: 69560, likes: 652, replies: 61, marks: 1196, body: "I built a money printer in two days🤯\n\nIm 100% sure that you can copy this repo and start making money today ✨\n\nSell this to real estate agents and use AI to make enhanced property images and videos 🏠\n\n→ Add property image\n→ Use AI to enhance it\n→ Send this over to a real" },
  { id: "2079893962861490268", at: "2026-07-22", impr: 55008, likes: 560, replies: 11, marks: 263, body: "Story time - And its about @shadcn 🤯\n\nAsked @shadcn about migrating icons from Lucide to Hugeicons.\n\nHe said - \"hmm not right now. It will be only for your ui primitives though because we can't have enough context to properly migrate everything in your app.\"\n\nOne day after he" },
  { id: "2071229155824250970", at: "2026-06-28", impr: 22040, likes: 193, replies: 45, marks: 55, body: "I just sold a software to Visma 🤯\n\nCo-founded Docdir and just did a exit 🔥\nThats why i have not been active on X lately.\n\nWe automated the sales prospectus for real estate agents\n\n◆ Trained on Norwegian documents\n◆ Full automation + quality checks\n◆ Solved a real need" },
  { id: "2073666183249666479", at: "2026-07-05", impr: 18777, likes: 180, replies: 13, marks: 320, body: "This made me develop MVPs x10 times faster 🤯\n\nI create a /playbook page at the start of every project now. Just init a project from @shadcn and your ready to go\n\nThis page lists all the UI components my project will use:\n\n◆ Page shells\n◆ Layout patterns\n◆ Component" },
  { id: "2079182322637652153", at: "2026-07-20", impr: 10148, likes: 76, replies: 3, marks: 28, body: "Is it possible to migrate bulk apply icons. From Lucide -> Hugeicons @shadcn ?" },
  { id: "2009330388616048975", at: "2026-01-08", impr: 10068, likes: 106, replies: 17, marks: 84, body: "You can build this in 2 hours - I did 🤯\n\nThis is getting out of hand, almost dont need to prompt and i got all off this ✨\n\nWhat's inside:\n◆ Blog Page\n◆ Help Center\n◆ Landing page\n\nUsed Cloude Code with Frontend Design plugin and give it a basic prompt and here we are. Help" },
  { id: "2082520417693044941", at: "2026-07-29", impr: 9093, likes: 27, replies: 1, marks: 19, body: "Love it ✨" },
  { id: "1995947429770707256", at: "2025-12-02", impr: 8969, likes: 120, replies: 13, marks: 141, body: "Somebody is going to run their business on this 🤯\n\n◆ Analyzes your LinkedIn profile\n◆ Writes like you would write\n◆ Creates content automatically before you need it\n\nInspired by @joshtriedcoding and @jomeerkatz, I built something similar to @contentport — just for" },
  { id: "1996120325889679388", at: "2025-12-03", impr: 6471, likes: 49, replies: 5, marks: 43, body: "Hagenkit is now integrated with @polar_sh\n\nLaunch your new project with payment solution in 2 minutes – from clicking the button to live preview ✨\n\n◆ Creates GitHub repo\n◆ Sets up Prisma database\n◆ Syncs environment secrets\n◆ Makes all the config for @polar_sh" },
  { id: "2081365128226701415", at: "2026-07-26", impr: 6255, likes: 74, replies: 10, marks: 94, body: "I built an open source AI hedge fund 🤯\n\nA panel of AI analysts + quant models that research tickers and form real market views\n\nThen a portfolio layer turns those views into actual positions\n\nDrew inspiration from @virattt's AI Hedge Fund repo - I recommend checking it out ✨" },
  { id: "1997066201210445906", at: "2025-12-05", impr: 4996, likes: 93, replies: 15, marks: 129, body: "You will never need to do marketing again 🤯\n\n◆ Writes articles for you\n◆ Posts to all social media platforms\n◆ Creates images for your content\n◆ We create posts while you sleep – you just press send\n◆ Fully automatic\n\nA little preview of the product launching this" },
  { id: "2008848980604805443", at: "2026-01-07", impr: 4468, likes: 15, replies: 8, marks: 2, body: "After looking at @garyvee latest video about collectibles im sold ✨\n\nWhat do you think? Collectible Cards from all the devs that i love?\n\nPing the devs that we should have in the set.\n\nIll start:\n@shadcn\n@orcdev\n@levelsio" },
  { id: "2008805862924816400", at: "2026-01-07", impr: 4247, likes: 41, replies: 4, marks: 89, body: "Repo 🔗" },
  { id: "2073453094017413281", at: "2026-07-04", impr: 4166, likes: 24, replies: 12, marks: 27, body: "What am i missing? 👀\n\nI think my multi-agent setup works well, but maybe I'm not tokenmaxing 🤔\n\nRunning 5 AI agents in parallel right now:\n◆ Fable as orchestrator\n◆ Opus 4.8 / Sonnet 5 as sub-agents\n◆ Each agent handles a different task\n\nIs this the right way to do" },
  { id: "1995366192605720631", at: "2025-12-01", impr: 3653, likes: 48, replies: 8, marks: 10, body: "Almost hit my Vercel limits on Hagenkit this month\n\nEdge requests at 991K out of 1M\n\nUpgrading the plan before December ends\n\nProject is growing faster than I expected ✨" },
  { id: "2008438348633792878", at: "2026-01-06", impr: 3560, likes: 9, replies: 2, marks: 2, body: "Just used Ultracite from @haydenbleasel and the DX is off the charts\n\nWell played sir ✨" },
  { id: "2015130809145889269", at: "2026-01-24", impr: 3549, likes: 11, replies: 7, marks: 13, body: "Looking for a good MCP for SEO - Anyone got something to recommend ✨" },
  { id: "1995032361235251680", at: "2025-11-30", impr: 3250, likes: 37, replies: 4, marks: 16, body: "Most people know me for open source projects\n\nBut I've also been running a VC fund on the side ✨\n\nNot Another VC - I invest in early-stage companies we want to see exist. I dont write big checks - The value is the time and commitment\n\nMy approach:\n◆ join every board\n◆ help" },
  { id: "2039435000752333163", at: "2026-04-01", impr: 2281, likes: 9, replies: 7, marks: 0, body: "Anybody else has this problem?\n\n6 mins inn, 12% used.\n\nWhat is going on? 🤯\n\n@claudeai @AnthropicAI" },
  { id: "2085301552269369417", at: "2026-08-06", impr: 1858, likes: 25, replies: 4, marks: 36, body: "My new workflow\n\n/prototype and iterate on this until we are ready. This gives you 3 examples, you pick one and do a new prototype on that.\n\n/ui-review what we have done, this goes over the screen and fixes the the paddings and margins.\n\n/ui-polish fixes" },
  { id: "2007428034031227357", at: "2026-01-03", impr: 1767, likes: 6, replies: 3, marks: 3, body: "MCP inside of Cursor i just to insane. Setup a new project in 5 minutes 🤯" },
  { id: "2017210702784516502", at: "2026-01-30", impr: 1561, likes: 9, replies: 5, marks: 1, body: "This year im documenting my life ✨\n\n(Not trying to be cool with sunglasses 😂)\n\nLooking forward to share my journey with everybody.\n\nTalked with @orcdev about content - Made me realize that i should do more video.\n\nLets gooo" },
  { id: "1996963676717236413", at: "2025-12-05", impr: 1471, likes: 8, replies: 0, marks: 3, body: "Nice work on this one @KlausCodes ✨\n\n🎮 My GitHub Wrapped 2025\n\n📊 2 086 contributions" },
  { id: "2081659029722407071", at: "2026-07-27", impr: 1390, likes: 23, replies: 8, marks: 6, body: "I launched 12 businesses before turning 30 🤯\n\nDev tools, real estate agency, clothing brand, SaaS companies, venture capital fund. Most of them failed hard.\n\nEvery project i built in silence launched to crickets. Months of work, zero users on day one.\n\nThen i started sharing" },
  { id: "2023656810926706741", at: "2026-02-17", impr: 1283, likes: 6, replies: 3, marks: 0, body: "My feed is now 90% openclaw - I need some developers in my again. Who to look at right now? ✨" },
  { id: "2013658995853005039", at: "2026-01-20", impr: 1170, likes: 5, replies: 0, marks: 1, body: "It was finally time. Looking forward to this ✨" },
  { id: "2011109286450250028", at: "2026-01-13", impr: 1059, likes: 16, replies: 6, marks: 2, body: "Ready to produce some content ✨" },
  { id: "2007564076562460675", at: "2026-01-03", impr: 978, likes: 12, replies: 3, marks: 7, body: "Still rocking Hagenkit and made some updates this holiday ✨\n\nAnd its free for everyone 🤯\n\nLaunch your new project in 2 minutes – from clicking the button to live preview 📷✨\n\nTechstack:\n🌐 App: @nextjs\n☁️ Hosting: @vercel\n🎨 UI: @shadcn\n🗂️ ORM:" },
  { id: "2007206088043790647", at: "2026-01-02", impr: 938, likes: 2, replies: 1, marks: 3, body: "This is what i have been looking for ✨" },
  { id: "2022000417044054455", at: "2026-02-12", impr: 931, likes: 9, replies: 2, marks: 1, body: "Working on my biggest project over - Can't wait to share" },
  { id: "2044703079832965512", at: "2026-04-16", impr: 850, likes: 1, replies: 0, marks: 0, body: "Im back baby ✨" },
  { id: "2072016697108689354", at: "2026-06-30", impr: 848, likes: 10, replies: 0, marks: 2, body: "The Cofounder model is changing ✅\n\nUsed to think the technical cofounder was everything\n\nBut now? i'd give 50% to someone who deeply knows the space\n\nWhy:\n◆ AI makes development easier each day\n◆ the hard part is knowing what to build for the niche\n◆ domain experts see" },
  { id: "2007539714807468524", at: "2026-01-03", impr: 844, likes: 5, replies: 1, marks: 3, body: "been thinking about @garyvee 2026 trends and how they map to open source ✨\n\nthe individual empire thing is already happening:\n◆ build oss tools\n◆ get community trust\n◆ launch paid tiers or services\n◆ own your revenue\n\n@calcom did this perfectly - free oss product, commercial" },
  { id: "2007453912387694819", at: "2026-01-03", impr: 769, likes: 2, replies: 0, marks: 0, body: "Sadly true story - The way to get reach is to just be a normal person. Lets go 2026 ✨" },
  { id: "1997066203094044710", at: "2025-12-05", impr: 756, likes: 1, replies: 0, marks: 1, body: "To get updates and be first in line to test 🔗" },
  { id: "2085245526203564256", at: "2026-08-06", impr: 752, likes: 1, replies: 1, marks: 1, body: "So i found the problem for me to ship more content. Its not the lack of ideas and video (I got a lot of video content)\n\nThe problem is that i cant edit. So we need to fix that.\n\nI need to do a developer move on this one ✨" },
  { id: "2007476421245939977", at: "2026-01-03", impr: 748, likes: 4, replies: 3, marks: 0, body: "Who is founders and indie devs that i should follow? Tag them below 👇" },
  { id: "2085694443244728741", at: "2026-08-07", impr: 746, likes: 14, replies: 1, marks: 1, body: "Are you building something?\nPing me ✨" },
  { id: "2009330391291973900", at: "2026-01-08", impr: 743, likes: 6, replies: 0, marks: 13, body: "Repo 🔗" },
  { id: "1993925751440331240", at: "2025-11-27", impr: 710, likes: 7, replies: 0, marks: 1, body: "My two cents ✨\n\nNot using AI for development in 2025 is like refusing to use a calculator.\n\nYou can do math by hand, but do you want to?" },
  { id: "2011914277238587495", at: "2026-01-15", impr: 698, likes: 9, replies: 1, marks: 0, body: "I'm so back" },
  { id: "2084364771009151404", at: "2026-08-03", impr: 686, likes: 5, replies: 1, marks: 2, body: "My prediction on the new way of getting views on social media after a deep dive in the algo this weekend.\n\nAnd i predict that \"Interest media\" has taken over for Sosial media\n\nYour feed doesn't care who you follow anymore.\nIt only cares if the post is relevant right now.\n\nSame" },
  { id: "2008110965032939536", at: "2026-01-05", impr: 644, likes: 6, replies: 4, marks: 1, body: "I disconnected this holiday and here is what i got out if it\n\nNothing, working is what i love. Lets go 2026 ✨" },
  { id: "1995947431918547341", at: "2025-12-02", impr: 638, likes: 2, replies: 0, marks: 0, body: "If you want updates on products i build 🔗" },
  { id: "2083871952108765544", at: "2026-08-02", impr: 629, likes: 7, replies: 0, marks: 2, body: "New mini-project coming along. This time i did something different.\n\nBeen studying UI and what feels «right» And i want those app to be polished before the release.\n\nThe new design skills have been a big help on this ✨" },
  { id: "2085625162972496328", at: "2026-08-07", impr: 603, likes: 8, replies: 0, marks: 1, body: "Meetings are now content days ✨" },
  { id: "2009741767864717630", at: "2026-01-09", impr: 581, likes: 4, replies: 2, marks: 0, body: "Prediction: Will Tailwind join Vercel?" },
  { id: "2085663273110683970", at: "2026-08-07", impr: 577, likes: 5, replies: 2, marks: 3, body: "I sold two SaaS companies in one year while still closing real estate deals in Norway ✅\n\nNo funding round.\nNo Goldman analyst background.\nJust a broker job by day and a laptop by night.\n\nHere are the 3 things that actually moved the needle:\n\n1. Your day job is reps, not a" },
  { id: "2009582175365349758", at: "2026-01-09", impr: 554, likes: 2, replies: 0, marks: 1, body: "Does anybody want to coach me on making good content videos? ✨\n\nIn exchange I'll help you build your app\n◆ coding\n◆ architecture\n◆ whatever you need\n\nDMs are open" },
  { id: "2010450534835331558", at: "2026-01-11", impr: 530, likes: 2, replies: 1, marks: 0, body: "Looking for video creators to follow ✨\n\nWant to build better content\n\nTag them bellow 👇" },
  { id: "2010038790711111817", at: "2026-01-10", impr: 522, likes: 2, replies: 0, marks: 0, body: "Some people have written to me, but still looking for the one 🔥\n\nDoes anybody want to coach me on making good content videos? ✨\n\nIn exchange I'll help you build your app\n◆ coding\n◆ architecture\n◆ whatever you need" },
  { id: "2010067875503943844", at: "2026-01-10", impr: 509, likes: 5, replies: 2, marks: 1, body: "if you started posting everything you're interested in ✨\n\nliterally everything - your side projects, random thoughts, what you're learning, what you're building\n\nyou'd be surprised how many people want to see it\n\nthe connections happen when you just share" },
  { id: "2081365130550333696", at: "2026-07-26", impr: 492, likes: 3, replies: 1, marks: 5, body: "Repo 🔗" },
  { id: "1996120327814783243", at: "2025-12-03", impr: 477, likes: 0, replies: 0, marks: 1, body: "Test it here 🔗" },
  { id: "2086030383779295741", at: "2026-08-08", impr: 378, likes: 2, replies: 0, marks: 1, body: "Codename: Quincy\n\nLaunching it in a week ✨" },
  { id: "2081365132563628460", at: "2026-07-26", impr: 358, likes: 1, replies: 0, marks: 1, body: "Demo 🔗" },
  { id: "2086181117619568797", at: "2026-08-08", impr: 287, likes: 5, replies: 1, marks: 1, body: "2410 contributions in 2025\n\n6126 so far in 2026 🤯\n\nSame builder. Different gear.\n\nWhat a time to be shipping" },
]

/**
 * The median, computed rather than pasted, because the number is the page and a
 * stale constant would quietly lie the first time a row is added. 57 posts, so
 * this is the 29th — and it lands on a real post ("This is what i have been
 * looking for ✨", 938), which is worth saying out loud somewhere in the UI.
 */
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

export const MEDIAN = median(POSTS.map((p) => p.impr))
export const MEAN = Math.round(
  POSTS.reduce((sum, p) => sum + p.impr, 0) / POSTS.length
)

/** Every post as a multiple of the median. The only comparison the vision doc allows. */
export function multiple(post: Post) {
  return post.impr / MEDIAN
}

/** Beat the median by 3× or better. 18 of 57 at the time of writing. */
export const OUTLIER_GATE = 3
export function isOutlier(post: Post) {
  return multiple(post) >= OUTLIER_GATE
}

/**
 * The first line, which is the only part of a post the algorithm gets to judge
 * before someone decides to keep reading. Long single-line posts still have to
 * truncate somewhere, so they get a character cap and a real ellipsis.
 */
export function hook(post: Post, cap = 90) {
  const first = post.body.split("\n")[0].trim()
  return first.length > cap ? `${first.slice(0, cap).trimEnd()}…` : first
}

export function formatMultiple(m: number) {
  if (m >= 10) return `${Math.round(m)}×`
  if (m >= 1) return `${m.toFixed(1)}×`
  return `${m.toFixed(2)}×`
}

export function formatDate(at: string) {
  const [, month, day] = at.split("-")
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}`
}

export const BY_DATE = [...POSTS].sort((a, b) => a.at.localeCompare(b.at))
export const BY_REACH = [...POSTS].sort((a, b) => b.impr - a.impr)

/**
 * Hook archetypes, derived from the body rather than declared.
 *
 * This is the honest stand-in for `riff_angle`: today nothing has been published
 * through Quincy (`scheduled_post` is empty), so there is no angle→post edge to
 * read. Grouping the imported history by the shape of its opening line answers
 * the same question with data that exists, and the Ledger variant says so on the
 * page rather than pretending the join is live.
 */
export type Angle = { id: string; label: string; note: string; test: (p: Post) => boolean }

export const ANGLES: Angle[] = [
  {
    id: "build-reveal",
    label: "Build reveal",
    note: "“I built X” with the shock emoji and a numbered teardown",
    test: (p) => /^(i (built|just built)|you can build|this made me|somebody is going to)/i.test(p.body),
  },
  {
    id: "story",
    label: "Story with a name in it",
    note: "A named person or company carries the anecdote",
    test: (p) => /^(story time|i just sold|i launched \d+|i sold)/i.test(p.body),
  },
  {
    id: "ask",
    label: "Open question",
    note: "Asks the timeline for names, tools or advice",
    test: (p) => /\?/.test(p.body.split("\n")[0]) || /^(looking for|who is|does anybody|anybody else)/i.test(p.body),
  },
  {
    id: "link-reply",
    label: "Link in a reply",
    note: "The repo/demo/test link hung under a thread",
    test: (p) => /^(repo|demo|test it here|to get updates|if you want updates)/i.test(p.body),
  },
  {
    id: "opinion",
    label: "Opinion or principle",
    note: "A position stated flat, no artefact attached",
    test: (p) => /^(my two cents|the cofounder|been thinking|my prediction|sadly true|if you started|prediction:)/i.test(p.body),
  },
]

export function angleOf(post: Post): Angle | null {
  return ANGLES.find((a) => a.test(post)) ?? null
}

export type AngleRollup = {
  angle: Angle | { id: string; label: string; note: string }
  posts: Post[]
  medianMultiple: number
  best: Post
}

export function rollupByAngle(): AngleRollup[] {
  const buckets = new Map<string, Post[]>()
  const loose: Post[] = []

  for (const post of POSTS) {
    const angle = angleOf(post)
    if (!angle) {
      loose.push(post)
      continue
    }
    const existing = buckets.get(angle.id)
    if (existing) existing.push(post)
    else buckets.set(angle.id, [post])
  }

  const rows: AngleRollup[] = []
  for (const angle of ANGLES) {
    const posts = buckets.get(angle.id)
    if (!posts || posts.length === 0) continue
    rows.push({
      angle,
      posts: [...posts].sort((a, b) => b.impr - a.impr),
      medianMultiple: median(posts.map((p) => p.impr)) / MEDIAN,
      best: posts.reduce((a, b) => (a.impr >= b.impr ? a : b)),
    })
  }

  if (loose.length > 0) {
    rows.push({
      angle: {
        id: "unfiled",
        label: "Unfiled",
        note: "No angle matched. Quincy did not draft these, so nothing claims them",
      },
      posts: [...loose].sort((a, b) => b.impr - a.impr),
      medianMultiple: median(loose.map((p) => p.impr)) / MEDIAN,
      best: loose.reduce((a, b) => (a.impr >= b.impr ? a : b)),
    })
  }

  return rows.sort((a, b) => b.medianMultiple - a.medianMultiple)
}
