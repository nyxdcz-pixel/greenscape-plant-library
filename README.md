# Greenscape Plant Library

A browser-based plant library, landscape database, project scheduling, quotation, BOQ, and costing tool created for **Greenscape Landscaping Services**.

The website helps organize plant information, prepare project plant lists, create landscape schedules and mood boards, calculate project quantities and costs, and generate project documents from one workspace.

## Live Website

Open the published website here:

**https://nyxdcz.github.io/greenscape-plant-library/**

## What's New

### Greenscape Project Costing Suite V1

The latest update adds a complete project costing workspace inside every Project List.

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

### Recent Project Workflow Updates

#### BOQ Floating Zoom and Scroll-Aware Help V5

- Floating BOQ zoom controls
- Help button remains available above the modal
- Help automatically hides during BOQ scrolling and returns afterward

#### BOQ Auto-Sync, Compact Layout, and Zoom V3

- Newly added Project List plants automatically enter an existing BOQ
- Existing BOQ prices and manual edits remain intact
- Compact BOQ workspace with saved zoom level

#### Project Plant Search and BOQ Reference Pricing V2

- Search plants by code, common name, scientific name, or category
- Filter plants by category when adding them to a project
- Save BOQ reference material prices with project plants
- Transfer reference prices into the BOQ automatically

#### Automatic Landscape BOQ Creator V1

- 100% Density and Specs
- 50% Density and Specs
- 35% Density and Specs
- Editable plant specifications, quantities, unit costs, labor costs, VAT, and totals
- CSV export and Print / Save PDF

#### Automatic Quotation Creator V1

- Project-based quotation drafting
- Automatic calculations for subtotals, taxes, fees, payments, and balances
- Saved browser drafts
- A4 preview and Print / Save PDF

## Main Features

- Searchable plant and landscape-material library
- Plant List Editor with save and cancel confirmation
- Add and edit plant records, photos, sizes, notes, tags, and links
- Duplicate plant-code detection and required-field validation
- Project plant lists and plant schedules
- Project-based quotation creator
- Automatic landscape BOQ creator
- Complete Project Costing Suite
- Plant quantity, maintenance, water, manpower, equipment, and tax calculators
- Project Statement of Account
- A3 portrait and landscape mood-board creator
- Adjustable cards per row and cards per column
- Board and BOQ zoom controls
- PNG, CSV, JSON, HTML, Excel, and printable PDF exports
- Mobile home-screen support through the web app manifest

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
5. Wait for the Pages deployment to show a green check mark.
6. Open the live website link.

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

To publish an update:

1. Replace or edit the updated file in the repository.
2. Commit the change to the `main` branch.
3. Wait for GitHub Pages to redeploy.
4. Open the live website and perform a hard refresh.

Hard refresh shortcuts:

- **Mac:** `Command + Shift + R`
- **Windows:** `Ctrl + Shift + R`

## Repository Structure

```text
index.html
.nojekyll
README.md
package.json
favicon.svg
favicon.ico
site.webmanifest
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
└── validate.mjs
```

## Local Validation

The project has no framework or generated build output. It uses dependency-free Node.js checks so repository updates can be verified consistently.

```bash
npm run lint
npm test
npm run build
npm run check
```

- `npm run lint` checks the website JavaScript files for syntax errors.
- `npm test` validates the HTML structure, metadata, manifest, and local asset paths.
- `npm run build` runs the same validation in static-build mode.
- `npm run check` runs both the JavaScript syntax checks and website validation.
- GitHub Pages serves the repository files directly.

## Privacy and Search Indexing

This is an internal company tool published on a public GitHub Pages URL. The page metadata and `robots.txt` ask search engines not to index or archive it. This discourages discovery but does not provide access control—anyone with the public URL may still open the site.

## Troubleshooting

### A new feature is missing

- Wait for the latest GitHub Pages deployment to finish.
- Confirm that the latest commit is on the `main` branch.
- Perform a hard refresh.
- Reopen the Project List after refreshing.

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

The website stores user-created records in the browser. Check whether browser data was cleared or whether the site was opened on another device or browser.

## Project Status

The website is actively maintained and updated as the Greenscape plant database, landscape workflow, project documentation, and costing tools develop.
