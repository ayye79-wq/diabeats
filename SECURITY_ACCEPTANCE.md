# Security acceptance

## Authorized Expo, Metro, and Babel advisory exception

DiabEats now uses Expo 57 and its matching React Native, Metro, and Expo module
versions. Expo Doctor, TypeScript, linting, production builds, BioTrace tests,
and a mobile browser smoke test all pass on this release.

As of 2026-08-20, the production audit reports eight high findings and one low
`@babel/core` finding. The full audit reports eight high, four moderate
development-tool findings in the `drizzle-kit` / deprecated esbuild chain, and
one low finding. Metro’s image parser is
replaced locally with a bounded implementation that accepts PNG, JPEG, GIF,
BMP, and VP8X/VP8/VP8L WebP inputs; it limits input size and JPEG segment traversal,
so the reported ICNS/JXL/HEIF infinite-loop paths are not present. npm audit
still reports the package name/version and cannot verify this local mitigation.
The remaining Expo/Metro advisories offer only a downgrade to Expo 53 as remediation; no
forward compatible package release is available. The Babel advisory offers a
major-version upgrade that is outside Expo 57's supported toolchain.

**Owner:** kalid kayo

**Review date:** 2026-11-18

The owner explicitly authorized this exception after the Expo 57 upgrade was
completed and validated. Reassess the Expo/Metro and Babel advisory set on the
review date and whenever Expo publishes a forward Metro security release.

## Compensating controls

- The application does not expose Metro to production end users; Metro is used
  for development and asset export.
- BioTrace, authentication, and API inputs remain server-side validated.
- Replit dependency, SAST, and privacy scans are clean.
- Production backend and static web builds are revalidated after dependency
  upgrades.