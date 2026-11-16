"use client"

import { createAuthClient } from "better-auth/react"
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins"
import { stripeClient } from "@better-auth/stripe/client"

import type { auth } from "./auth"

export const authClient = createAuthClient({
  // Same origin in the browser, so baseURL is only needed if the API ever moves
  // to its own host. BETTER_AUTH_URL covers the server side.
  plugins: [
    // Teaches the client the fields `user.additionalFields` adds on the server,
    // so `signUp.email({ timezone })` typechecks and `session.user.timezone`
    // exists. Type-only inference from the server config — it adds no runtime
    // behaviour and imports no server code into the bundle.
    inferAdditionalFields<typeof auth>(),
    adminClient(),
    // `subscription: true` is what adds authClient.subscription.* — upgrade,
    // list, cancel, billingPortal. Without it the plugin only wires customer
    // state and the billing page has nothing to call.
    stripeClient({ subscription: true }),
  ],
})

export const { signIn, signUp, signOut, useSession, getSession } = authClient
