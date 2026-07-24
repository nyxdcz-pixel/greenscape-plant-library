# Greenscape Plant Library

A browser-based plant library, landscape database, project scheduling, quotation, BOQ, and costing tool created for **Greenscape Landscaping Services**.

The website helps organize plant information, prepare project plant lists, create landscape schedules and mood boards, calculate project quantities and costs, and generate project documents from one workspace.

## Live Website

Open the published website here:

**https://nyxdcz.github.io/greenscape-plant-library/**

## What's New

### Repository Quality Review V1

The latest repository update improves performance, responsive behavior, accessibility, metadata, validation, and code quality while preserving the existing design, workflows, and browser-local data.

#### Performance

- Consolidated duplicated BOQ enhancement CSS.
- Removed the continuous pointer-move collision listener.
- Preserved compact viewport-fixed BOQ zoom controls.
- Preserved Help hiding while scrolling or overlapping visible modal actions.
- Added `defer` to all six website JavaScript files.
- Added `content-visibility` for long plant-card lists where supported.
- Added contained momentum scrolling for large modal tables.
- Removed empty historical patch comments from `index.html`.

#### Responsive Design and Accessibility

- Added clear `:focus-visible` keyboard outlines.
- Added shared keyboard focus trapping for visible dialogs.
- Added reduced-motion support.
- Improved touch-target sizes.
- Improved long-text wrapping and overflow handling.
- Allowed project and modal action groups to wrap safely.
- Made toast messages atomic screen-reader announcements.
- Added `role="alert"` for error messages and `role="status"` for normal messages.
- Added explicit button types to prevent unintended form submission.

#### SEO and Privacy

- Improved the page description and social-sharing metadata.
- Added the Open Graph site name.
- Added Twitter image alternative text.
- Added a strict referrer policy.
- Preserved the canonical URL.
- Preserved `noindex`, `nofollow`, `noarchive`, and `nosnippet`.
- Kept crawler blocking because the website is an internal company tool.
- A sitemap is intentionally not published while indexing is disabled.

#### Code Quality and Security

- Extended syntax validation to every website JavaScript file.
- Added checks for button types and safe new-tab links.
- Added checks for deferred scripts, metadata, image loading, keyboard focus support, local assets, manifest icons, and CSV injection protection.
- Added `.env`, logs, editor folders, and `node_modules` to `.gitignore`.
- Added `npm run audit`.
- Added `npm run quality`.
- Updated GitHub Actions to run the expanded quality command on pushes and pull requests to `main`.

The review was implemented through these focused commits:

```text
perf: streamline BOQ enhancements and loading
fix: improve responsive and accessible interactions
test: expand quality checks and documentation
```

### Greenscape Project Costing Suite V1

The Project Costing Suite adds a complete project-costing workspace inside every Project List.

Included tools:

- Project Costing Summary
- 100%, 50%, and 35% BOQ Comparison
- Automatic Plant Quantity Calculator
- Plant Specification Matrix
- Density Specification Presets
- Cost Comparison Dashboard
- Maintenance Cost Calculator
- Water Consumption Calculator
- Consumables Calculator
- Manpower Calculator
- Projected Work Duration
- Tools and Equipment Budget
- Equipment Rental and Fuel Costing
- Admin, Profit, Safety, Tax, and VAT Controls
- Project Statement of Account
- Complete project export as HTML, printable PDF, JSON, and CSV

The Costing Suite connects to the selected project's plant list, quantities, BOQ draft, density scenarios, and reference prices. Open **Project Lists**, select a project, and click **Costing Suite**.

## Main Features

- Searchable plant and landscape-material library
- Plant List Editor with save and cancel confirmation
- Add and edit plant records, photos, sizes, notes, tags, and links
- Duplicate plant-code detection and required-field validation
- Project plant lists and plant schedules
- Project-based quotation creator
- Automatic landscape BOQ creator
- 100%, 50%, and 35% density and specification scenarios
- BOQ auto-sync for newly added project plants
- Compact viewport-fixed BOQ zoom controls
- Help widget that hides while scrolling or covering visible modal actions
- Complete Project Costing Suite
- Plant quantity, maintenance, water, manpower, equipment, and tax calculators
- Project Statement of Account
- A3 portrait and landscape mood-board creator
- Adjustable cards per row and cards per column
- PNG, CSV, JSON, HTML, Excel, and printable PDF exports
- Mobile home-screen support through the web app manifest

## Technology Stack

The project is a dependency-free static website built with:

- HTML
- CSS
- Vanilla JavaScript
- Browser `localStorage`
- GitHub Pages
- Node.js 20 or newer for repository validation only

The project does not use a frontend framework, package dependency, TypeScript, or generated build output.

## Important Data Note

Plant edits, project records, quotation drafts, BOQ drafts, and costing records created inside the live website are stored in the browser using **local storage**.

This means:

- Changes remain on the same browser and device.
- Changes do not automatically update the GitHub repository.
- Changes do not automatically appear on another computer or phone.
- Clearing browser data may remove locally saved records.
- Use the available export tools regularly to keep backups.

## How to Open the Published Website

1. Open Chrome, Safari, or another modern browser.
2. Go to:

   `https://nyxdcz.github.io/greenscape-plant-library/`

3. Bookmark the page for easier access.
4. On a phone, use **Add to Home Screen** to create an app-like shortcut.

## How to Use the Project Tools

1. Open **Project Lists**.
2. Create a project or open an existing project.
3. Add plants, quantities, spacing, and BOQ reference prices.
4. Use the project actions to open:
   - **Quotation**
   - **Create BOQ**
   - **Costing Suite**
   - **View Schedule**
5. Save or export the completed project documents.

## How to Publish or Check GitHub Pages

1. Open the repository:

   `https://github.com/nyxdcz/greenscape-plant-library`

2. Go to **Settings → Pages**.
3. Under **Build and deployment**, confirm:
   - **Source:** Deploy from a branch
   - **Branch:** `main`
   - **Folder:** `/ (root)`
4. Open the **Actions** tab.
5. Wait for **Website Checks** and **pages build and deployment** to show green check marks.
6. Open the live website.
7. Perform a hard refresh.

Hard-refresh shortcuts:

- **Mac:** `Command + Shift + R`
- **Windows:** `Ctrl + Shift + R`

## How to Update the Website

Website design and function updates normally involve one or more of these files:

- `index.html`
- `assets/css/styles.css`
- `assets/css/quotation.css`
- `assets/css/boq.css`
- `assets/css/boq-enhancements.css`
- `assets/css/project-costing.css`
- `assets/js/app.js`
- `assets/js/data.js`
- `assets/js/quotation.js`
- `assets/js/boq.js`
- `assets/js/boq-enhancements.js`
- `assets/js/project-costing.js`
- `scripts/validate.mjs`
- `scripts/audit.mjs`
- `package.json`
- `.github/workflows/ci.yml`
- `README.md`

To publish an update:

1. Edit only the files related to the change.
2. Update `README.md` in the same change.
3. Run the repository checks.
4. Commit the files with a clear commit message.
5. Push the change to `main` or merge an approved pull request.
6. Wait for GitHub Pages to redeploy.
7. Hard-refresh the live website and verify the affected views.

## README Update Policy

Every future website or repository change must also update `README.md`.

The README update should include, when applicable:

- Version or feature title
- Summary of what changed
- New or changed features
- Files affected
- Installation or usage notes
- Tests and checks performed
- Known limitations or remaining work

Documentation should be committed and deployed together with the related code changes.

## Repository Structure

```text
index.html
.nojekyll
README.md
package.json
favicon.svg
favicon.ico
site.webmanifest
robots.txt
assets/
├── css/
│   ├── styles.css
│   ├── quotation.css
│   ├── boq.css
│   ├── boq-enhancements.css
│   └── project-costing.css
├── js/
│   ├── data.js
│   ├── app.js
│   ├── quotation.js
│   ├── boq.js
│   ├── boq-enhancements.js
│   └── project-costing.js
├── icons/
│   └── app icons
└── images/
    └── plant and interface images
scripts/
├── validate.mjs
└── audit.mjs
.github/
└── workflows/
    └── ci.yml
```

## Local Validation

The project uses dependency-free Node.js checks so repository updates can be verified consistently.

```bash
npm run lint
npm test
npm run build
npm run check
npm run audit
npm run quality
```

- `npm run lint` checks every website JavaScript file for syntax errors.
- `npm test` validates HTML structure, metadata, accessibility hooks, security guards, manifest data, and local asset paths.
- `npm run build` runs the same validation in static-build mode.
- `npm run check` runs JavaScript syntax checks and the standard validation.
- `npm run audit` reports static HTML, CSS, JavaScript, script-loading, and image-loading metrics.
- `npm run quality` runs linting, tests, build validation, and the static audit.
- A TypeScript check is not applicable because the repository contains no TypeScript source or configuration.
- GitHub Pages serves the repository files directly.

## Quality Review Notes

- The website intentionally remains a dependency-free static application.
- Quotation, BOQ, Costing, plant records, and project data continue using the existing browser `localStorage` keys.
- The repository review preserved the existing visual direction and workflows.
- Search indexing remains disabled because this is an internal company tool.
- Real Core Web Vitals should be measured against the deployed website using Lighthouse or WebPageTest.
- The validation scripts provide static checks but do not replace manual browser testing.

## Privacy and Search Indexing

This is an internal company tool published on a public GitHub Pages URL.

The page metadata and `robots.txt` ask search engines not to index or archive it. This discourages discovery but does not provide authentication or access control. Anyone with the public URL may still open the website.

## Troubleshooting

### A new feature is missing

- Wait for the latest GitHub Pages deployment to finish.
- Confirm that the latest commit is on the `main` branch.
- Perform a hard refresh.
- Reopen the affected page or project tool.

### Website Checks fail

1. Open the failed workflow in the **Actions** tab.
2. Expand the failed step.
3. Read the exact validation message.
4. Fix the reported file or template.
5. Run `npm run quality` locally.
6. Commit and push the correction.

### The website shows a 404 page

Check that:

- `index.html` is located in the repository root.
- GitHub Pages is using `main` and `/ (root)`.
- The latest Pages deployment completed successfully.
- The repository name is exactly `greenscape-plant-library`.

### The website shows an older version

Wait a few minutes after committing, then perform a hard refresh.

### Images or styles are missing

Confirm that the full `assets` folder was uploaded and that file names and folder paths were not changed.

### Saved records disappeared

The website stores user-created records in the browser. Check whether browser data was cleared or whether the website was opened on another device or browser.

## Project Status

The website is actively maintained and updated as the Greenscape plant database, landscape workflow, project documentation, quotation, BOQ, and costing tools develop.
