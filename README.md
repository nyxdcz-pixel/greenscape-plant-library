# Greenscape Plant Library

This repository contains the published Greenscape Plant Library website.

## How to open the website after publishing on GitHub

### Step 1 — Open the repository

Go to your GitHub repository:

`https://github.com/nyxdcz-pixel/greenscape-plant-library`

### Step 2 — Open GitHub Pages settings

1. Click **Settings** at the top of the repository.
2. In the left menu, click **Pages**.
3. Under **Build and deployment**, confirm the following settings:
   - **Source:** Deploy from a branch
   - **Branch:** `main`
   - **Folder:** `/ (root)`
4. Click **Save** when needed.

### Step 3 — Wait for publishing

GitHub usually needs a few minutes to publish or update the website.

You can check the deployment status by opening the **Actions** tab. Wait until the deployment displays a green check mark.

### Step 4 — Open the live website

The published website address is:

`https://nyxdcz-pixel.github.io/greenscape-plant-library/`

You can copy this address, open it in Chrome or Safari, and bookmark it for easier access.

### Step 5 — Refresh after an update

When a new version is uploaded to GitHub, wait a few minutes and refresh the website.

On Mac, use:

`Command + Shift + R`

On Windows, use:

`Ctrl + Shift + R`

This forces the browser to load the newest files instead of an older cached version.

## Opening the website on a phone

1. Open Chrome or Safari on the phone.
2. Enter the published website address.
3. Use **Add to Home Screen** to create an app-like shortcut.

## How to update the website later

1. Replace the existing website files in the repository with the updated files.
2. Commit the changes to the `main` branch.
3. GitHub Pages will publish the update automatically.
4. Wait a few minutes, then hard-refresh the live website.

## Important note about plant edits

Plant information edited inside the live website is saved in that browser using local storage.

This means:

- The edits remain on the same browser and device.
- They do not automatically update the GitHub repository.
- They do not automatically appear on another computer or phone.
- Use **Export Excel** regularly as a backup.

## Troubleshooting

### The website shows a 404 page

Check that:

- `index.html` is in the main repository folder, not inside another folder.
- GitHub Pages is using the `main` branch and `/ (root)` folder.
- The latest Pages deployment completed successfully.
- The repository name is exactly `greenscape-plant-library`.

### The website shows an older version

Wait a few minutes and use a hard refresh:

- Mac: `Command + Shift + R`
- Windows: `Ctrl + Shift + R`

### Images or files are missing

Make sure the complete `assets` folder was uploaded together with `index.html`.

## Repository structure

```text
index.html
.nojekyll
README.md
assets/
├── css/
│   └── styles.css
├── js/
│   ├── data.js
│   └── app.js
└── images/
    └── plant image files
```
