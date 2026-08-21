# Security Policy

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report it privately through
[GitHub Security Advisories](https://github.com/Codehagen/Quincy/security/advisories/new),
or by email to **christer.hagen@gmail.com** with `[SECURITY]` in the subject.

Include what you can:

- A description of the issue and where it lives (route, file, or flow).
- Steps to reproduce, or a proof of concept.
- What an attacker gains from it.

You will get an acknowledgement within a few days. Please give us reasonable
time to ship a fix before any public disclosure — we will credit you in the
fix unless you prefer otherwise.

## Scope

Quincy handles OAuth tokens for connected channels, billing through Stripe,
and email delivery. Reports about authentication, session handling, the
webhook endpoints (`app/api/webhooks/**`), token storage, and anything that
lets one user read or spend as another are especially welcome.

## Supported versions

Quincy is pre-1.0. Only the latest `main` is supported; fixes are not
backported.
