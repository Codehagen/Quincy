import { Canvas } from "./canvas"
import { Blob, Cta, Hl, Margin, Receipt, Ring } from "./marks"

/**
 * Dark, centred and sure of itself, as a reference does it, but the product
 * picture is a marked-up page instead of an app tour: a merged pull request
 * with every editor mark on it, and beside it Quincy's receipt of what it
 * did, ending on "held for your read".
 */
export default function ThePullRequest() {
  return (
    <Canvas dark>
      <div className="absolute inset-x-16 top-9 flex items-center justify-between text-[15px]">
        <span className="flex items-center gap-2 font-[600] tracking-[-0.01em]">
          <Blob size={20} />
          Quincy
        </span>
        <span className="text-kit-ink-muted">$49 a month, one plan</span>
      </div>

      <div className="absolute inset-x-0 top-[104px] flex flex-col items-center text-center">
        <h1 className="text-[68px] leading-[1.02] font-[600] tracking-[-0.055em]">
          You ship it. Quincy writes it up.
        </h1>
        <p className="mt-5 max-w-[50ch] text-[18px] leading-[1.5] text-kit-ink-muted">
          It reads the pull requests you merge and drafts the post in your
          voice. Nothing goes out until you send it.
        </p>
        <div className="mt-8">
          <Cta>Join the waitlist</Cta>
        </div>
      </div>

      {/* The product picture: one window, cropped by the frame. */}
      <div className="absolute top-[388px] left-1/2 flex h-[560px] w-[1080px] -translate-x-1/2 overflow-hidden rounded-t-[22px] bg-kit-object shadow-kit-object">
        {/* The page Quincy marked. Graphite marks, one yellow line. */}
        <div className="w-[690px] flex-none px-9 pt-7">
          <div className="flex items-center gap-3 font-kit-mono text-[12px] text-kit-ink-muted">
            <span>#212</span>
            <span>merged Friday 16:40</span>
            <span>+184 −61</span>
          </div>
          <h3 className="mt-3 text-[19px] leading-[1.3] font-[600] tracking-[-0.015em]">
            Send invoices in the customer&apos;s own currency
          </h3>
          <div className="mt-4 flex w-[440px] flex-col gap-3.5 text-[15px] leading-[1.55]">
            <Margin note="skip this. they weren't there" gap={22} width={170}>
              <p className="text-kit-ink-muted">
                Every invoice went out in USD, wherever the customer was.
                Support got a currency ticket most days, mostly from people who
                thought they had been charged twice.
              </p>
            </Margin>
            <Margin note="what I did" gap={22} width={170}>
              <p>
                This sends the invoice in the billing country&apos;s currency.
                Old invoices stay as they were.
              </p>
            </Margin>
            <Margin note="what happened" gap={22} width={170}>
              <p>
                <Hl>
                  Currency tickets since Monday:{" "}
                  <span className="mr-1 ml-2">
                    <Ring>2</Ring>
                  </span>
                </Hl>{" "}
                The week before: 27.
              </p>
            </Margin>
            <Margin note="what it meant" gap={22} width={170}>
              <p>Nobody was upset about the price. They could not read the bill.</p>
            </Margin>
          </div>
        </div>

        {/* Quincy's receipt. */}
        <div className="flex-1 border-l border-kit-hairline px-7 pt-7">
          <div className="flex items-center gap-2.5">
            <Blob size={24} />
            <span className="text-[14px] font-[600]">Quincy</span>
            <span className="font-kit-mono text-[12px] text-kit-ink-muted">Friday 16:52</span>
          </div>
          <div className="mt-5">
            <Receipt
              lines={[
                ["Read #212", "4 paragraphs"],
                ["Found the number", "27 tickets to 2"],
                ["Cut the backstory", "it reads fine without it"],
                ["Drafted", "2 posts, held for your read"],
              ]}
            />
          </div>
          <p className="mt-6 text-[15px] leading-[1.5]">
            One for X, one for LinkedIn. Nothing went out. Want the X one first
            thing Monday?
          </p>
        </div>
      </div>
    </Canvas>
  )
}
