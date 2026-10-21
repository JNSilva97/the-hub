# The Hub

A personal space with a dark blue, futuristic interface.

## Current version

An animated orbital home screen with eight module launchers. The modules currently open placeholder panels; their features are not implemented yet.

Built with HTML, CSS and JavaScript. No dependencies or build step.

## Preview locally

Open `index.html` in a modern browser, or serve this folder with:

```sh
python -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/`.

## Publish with GitHub Pages

In the repository settings, open **Pages**, choose **Deploy from a branch**, then select **main** and **/ (root)**.

Changes pushed to `main` update the live site after GitHub finishes deployment.

The published site is public. Keep personal records, credentials and private data out of the repository and site files.

## Check the interface

With the page open, paste `smoke-test.js` into the browser developer console, then run `testHub()`.

The check covers all eight launchers, dialog titles, closing, focus restoration, touch target sizes, label fit and horizontal overflow. Repeat at desktop and mobile widths.
