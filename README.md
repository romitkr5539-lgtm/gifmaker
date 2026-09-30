# ClipForge – Ready for Cloudflare Pages

This folder (`romitgif`) contains all static files required to deploy **ClipForge Video to GIF Studio** directly on **Cloudflare Pages**.

---

## 📁 Included Files

- **`index.html`**: Complete web application structure with the custom upload box, processing stage, and animated GIF showcase.
- **`style.css`**: Complete responsive styles and layout matching the red cloud upload card.
- **`script.js`**: 100% client-side WebAssembly video-to-GIF conversion engine and UI state controller.
- **`image-to-gif.html`**, **`image-to-gif.css`**, and **`image-to-gif.js`**: Browser-based image-sequence to GIF tool.
- **`gif-compressor.html`**, **`gif-compressor.css`**, and **`gif-compressor.js`**: Animated GIF optimizer with frame timing, transparency, and looping retained.
- **`_headers`**: Cloudflare Pages headers configuring `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` for optimal WebAssembly execution.

The image converter and GIF compressor load their browser libraries from jsDelivr, so those tools require an internet connection to initialize. Files are processed locally and are not uploaded.

---

## 🚀 How to Deploy on Cloudflare Pages

### Option 1: Direct Upload (Fastest — 1 Minute)
1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left sidebar, navigate to **Compute (Workers) > Workers & Pages** (or **Pages**).
3. Click **Create application** &rarr; select the **Pages** tab &rarr; click **Upload assets**.
4. Enter a project name (e.g. `clipforge` or `romitgif`).
5. Drag and drop the **`romitgif`** folder directly into the upload area (or zip the contents and upload the zip).
6. Click **Deploy site**.
7. Your site is instantly live at `https://<your-project>.pages.dev` with free SSL and worldwide CDN!

---

### Option 2: Connect to Git (GitHub / GitLab)
1. Push this `romitgif` directory (or your repository) to GitHub.
2. In Cloudflare Pages, click **Connect to Git** and choose your repository.
3. Configure build settings:
   - **Framework preset**: None
   - **Build command**: *(leave empty)*
   - **Build output directory**: `romitgif`
4. Click **Save and Deploy**. Cloudflare will automatically deploy your site on every git push!
