import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"
import { constructMetadata } from "@/lib/metadata"

export const metadata = constructMetadata({
  title: "Forgot password",
  noIndex: true,
})

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />
}
