import { Shell } from "../../shell"
import { RhythmDetail } from "./detail"

export const metadata = {
  title: "Prototype — Rhythm detail",
  robots: { index: false, follow: false },
}

export default async function RhythmDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <Shell>
      <RhythmDetail id={id} />
    </Shell>
  )
}
