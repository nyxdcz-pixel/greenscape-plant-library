# Security policy

## Reporting a vulnerability

Please report security concerns privately to **nyxdcz@gmail.com**. Include the affected page or feature, steps to reproduce the issue, and screenshots when useful.

Do not include sensitive details in a public GitHub issue. We will review the report and respond when we can confirm its scope.

## Important deployment notes

- This repository publishes a static GitHub Pages website. The company-use notice and `noindex` metadata do not provide access control; anyone with the public URL may be able to open the site and inspect its client-side files.
- Plant, project, and mood-board edits are stored in the current browser. They are not synchronized between devices and may be lost if browser storage is cleared.
- Never commit API keys, passwords, tokens, private customer details, or service-role credentials. Store future server-side credentials in the hosting provider's secret manager.
- Only the current `main` branch is maintained.

If the website later handles confidential shared data, move it behind authenticated hosting and enforce authorization on the server rather than in browser JavaScript.
