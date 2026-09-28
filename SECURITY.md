# Security policy

## Reporting a vulnerability

Report privately, not through a public issue or pull request.

- Preferred: open a draft advisory on the repository
  (Security > Advisories > Report a vulnerability).
- Otherwise: write to security@linagora.com with `twake-drive-mobile`
  in the subject.

Please include the affected version or commit, the platform, and what an
attacker gains. A proof of concept helps but is not required.

Expect an acknowledgement within five working days. We will tell you whether
the report is accepted, and agree a disclosure date with you before anything
is published.

## Scope

The mobile client in this repository: the React Native application, the
Android `DocumentsProvider`, and the iOS File Provider and Share extensions.

Server-side issues belong to the Twake Drive stack, not here. Reports about
a deployment's own configuration should go to whoever operates that instance.

## Supported versions

The latest release on the Play Store and the App Store. Fixes are not
backported to older builds.
