import { QuincyTexts } from "./quincy-texts"

/** Quincy comes to you: the thread, at reading size, on its own stage. */
export function TextsPicture() {
  return (
    <div className="rounded-kit-stage bg-kit-stage px-3 py-10 sm:px-12 sm:py-14">
      <div className="mx-auto max-w-[35rem]">
        <QuincyTexts />
      </div>
    </div>
  )
}
