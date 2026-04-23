# HQ Asset Viewer

## Running offline from `file://`

1. Build the app:

   ```bash
   npm run build
   ```

   (Alias: `npm run build:offline`)

2. Open `dist/index.html` directly in your browser (double-click is fine).

The production output is a fully self-contained single HTML file so it works from local disk without a web server.

Hash-based URLs are expected for navigation, for example:

- `#/`
- `#/documentation`
- `#/documentation/changelog`
- `#/documentation/technical`
- `#/documentation/user-guide`
