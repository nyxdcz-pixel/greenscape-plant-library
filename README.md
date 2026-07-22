# Greenscape Plant Library

A browser-based plant library and landscape database created for **Greenscape Landscaping Services**.

The website helps organize plant information, edit plant records, prepare project plant lists, and create printable A3 plant mood boards from one workspace.

## Live Website

Open the published website here:

**https://nyxdcz.github.io/greenscape-plant-library/**

## Main Features

- Searchable plant and landscape-material library
- Plant List Editor with save and cancel confirmation
- Add and edit plant records, photos, sizes, notes, tags, and links
- Duplicate plant-code detection and required-field validation
- Project plant lists and plant schedules
- A3 portrait and landscape mood-board creator
- Adjustable cards per row and cards per column
- Board zoom controls
- PNG export and Print / Save PDF
- Excel import and export
- Mobile home-screen support through the web app manifest

## Important Data Note

Plant edits made inside the live website are stored in the browser using **local storage**.

This means:

- Changes remain on the same browser and device.
- Changes do not automatically update the GitHub repository.
- Changes do not automatically appear on another computer or phone.
- Clearing browser data may remove locally saved edits.
- Use **Export Excel** regularly to keep a backup of the plant database.

## How to Open the Published Website

1. Open Chrome, Safari, or another modern browser.
2. Go to:

   `https://nyxdcz.github.io/greenscape-plant-library/`

3. Bookmark the page for easier access.
4. On a phone, use **Add to Home Screen** to create an app-like shortcut.

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
- `assets/js/app.js`
- `assets/js/data.js`

To publish an update:

1. Replace the updated file in the same repository folder.
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
favicon.svg
favicon.ico
site.webmanifest
assets/
├── css/
│   └── styles.css
├── js/
│   ├── data.js
│   └── app.js
├── icons/
│   └── app icons
└── images/
    └── plant and interface images
```

## Local Validation

The project has no framework or generated build output. It uses dependency-free Node.js checks so repository updates can be verified consistently.

```bash
npm run lint
npm test
npm run build
```

- `npm run lint` checks both JavaScript files for syntax errors.
- `npm test` validates the HTML structure, metadata, manifest, and local asset paths.
- `npm run build` runs the same validation in static-build mode; GitHub Pages serves the repository files directly.

## Privacy and Search Indexing

This is an internal company tool published on a public GitHub Pages URL. The page metadata and `robots.txt` ask search engines not to index or archive it. This discourages discovery but does not provide access control—anyone with the public URL may still open the site.

## Troubleshooting

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

### Plant edits disappeared

The website stores edits in the browser. Check whether browser data was cleared or whether the site was opened on another device or browser.

## Project Status

The website is actively maintained and updated as the Greenscape plant database and landscape workflow develop.
