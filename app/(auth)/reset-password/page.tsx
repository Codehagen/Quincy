import { ResetPasswordForm } from "@/components/auth/reset-password-form"
import { constructMetadata } from "@/lib/metadata"

export const metadata = constructMetadata({
  title: "Reset password",
})

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>
}) {
  const { token, error } = await searchParams
  return <ResetPasswordForm token={token ?? null} error={error ?? null} />
}
