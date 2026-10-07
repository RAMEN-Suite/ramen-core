# Security policy

## Supported versions

Security fixes are applied to the latest published version. Pre-release versions may change without a compatibility guarantee.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not open a public issue for an undisclosed vulnerability.

Include the affected version, reproduction steps, impact, and any known mitigation. You can expect an acknowledgement within seven days. A fix timeline depends on severity and reproducibility; coordinated disclosure will be agreed with the reporter before details are published.

## Supply chain

Every release is built and published from GitHub Actions using npm trusted publishing and carries a provenance attestation. You can verify installed packages with `npm audit signatures`.

Each GitHub release includes a CycloneDX SBOM of the published package.
