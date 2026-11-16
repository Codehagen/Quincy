import { DeskAndPocket } from "./desk-and-pocket"

/**
 * The landing hero picture: the desk and the pocket, cropped to the stage radius.
 *
 * The box is sized in CSS to the frame the Stage will settle on, so the
 * server HTML (rendered at the wide design, scale 1) does not jump when the
 * Stage measures after hydration. The numbers are DeskAndPocket's Stage:
 * wide 1072×560 scaled to the width; compact under 640px, 360×540, scaled
 * down only under 360px.
 */
export function HeroPicture() {
  return (
    <div className="@container">
      <div className="h-[min(540px,150cqw)] w-full overflow-hidden rounded-kit-stage @min-[640px]:aspect-[1072/560] @min-[640px]:h-auto @min-[640px]:max-h-[560px]">
        <DeskAndPocket />
      </div>
    </div>
  )
}
