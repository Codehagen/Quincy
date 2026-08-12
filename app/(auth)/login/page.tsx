import { isGoogleEnabled } from "@/lib/auth"
import { getLastLoginMethod } from "@/lib/last-login-method"
import { safeNextPath } from "@/lib/auth-validation"
import { LoginForm } from "@/components/auth/login-form"
import { constructMetadata } from "@/lib/metadata"

export const metadata = constructMetadata({
  title: "Log in",
})

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  // Read here rather than in the form: a server read puts the badge in the
  // first paint instead of a frame after it.
  const lastUsed = await getLastLoginMethod()

  return (
    <LoginForm
      googleEnabled={isGoogleEnabled}
      next={safeNextPath(next)}
      lastUsed={lastUsed}
    />
  )
}
