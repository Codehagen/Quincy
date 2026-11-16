/*
 * The frame the landing page's smaller pictures share. Each picture is a
 * calmer version of a real Quincy surface at its real type size (Stageshow's
 * "simplified"), on a grey stage that crops it at the foot, with the friend
 * on its top edge in the state that surface is in.
 *
 * Pictures are role="img" with a sentence for a name: their buttons are
 * spans, and a screen reader should hear what the picture says, not a row
 * of controls that do nothing.
 */

/** A grey stage that crops the object standing in it at its foot. */
export function Crop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="relative overflow-hidden rounded-kit-stage bg-kit-stage px-4 pt-[4.5rem] pointer-events-none select-none sm:px-10 lg:px-16"
    >
      <div className="-mb-kit-bleed">{children}</div>
    </div>
  )
}

/** The object on a stage: white, ringed, soft shadow, the kit's pad, room at the foot for the crop. */
export function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-kit-object bg-kit-object p-kit-pad pb-[3.75rem] shadow-kit-object sm:px-7 sm:pt-6">
      {children}
    </div>
  )
}
