<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/35a9f347-eecd-4d82-816d-f67d00a46324

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`


## Build for GitHub Pages

Use one of these build commands depending on where you publish:

- **Project Pages** (`https://<user>.github.io/<repo>/`): `npm run build:pages`
- **User/Org Pages** (`https://<user>.github.io/`): `npm run build:pages:root`

The build output is generated in `dist/`.


## Deploy to GitHub Pages (build-ready)

This repo now includes a workflow at `.github/workflows/deploy-pages.yml` that:

1. Builds on pushes to `main`
2. Automatically sets the Vite base path to `/<repo>/`
3. Publishes `dist/` to GitHub Pages

### One-time GitHub setup

- In your repository, go to **Settings → Pages**
- Set **Source** to **GitHub Actions**

### Local verification

- Project Pages (`https://<user>.github.io/<repo>/`): `npm run build:pages`
- User/Org Pages (`https://<user>.github.io/`): `npm run build:pages:root`
