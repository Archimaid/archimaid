# archimaid.org

The Archimaid website, built with [Astro](https://astro.build) as a static site. It uses the package in this repository, not a published release, so the root package must be built first.

## Develop

```sh
npm ci && npm run build        # in the repository root
cd site
npm ci
npm run dev
```

`npm run build` type-checks the site and writes it to `site/dist/`.

## Diagrams

The hero diagram is `src/diagrams/order-fulfilment.mmd`. The page shows that source, highlighted at build time with the package's own catalogue, next to `order-fulfilment.svg`. The SVG is committed so that the build needs no browser. After changing a diagram, render it again with Playwright's Chromium installed:

```sh
npm run render:diagrams
```

## Brand images

`scripts/render-brand.mjs` draws the favicon, the app and manifest icons, the social preview image (`public/og.png`) and the GitHub avatar (`brand/github-avatar.png`) from one definition of the mark. The images are committed; render them again after changing the mark, the social preview or the hero diagram:

```sh
npm run render:brand
```

## Deploy to Cloudflare

The site deploys as a Cloudflare Worker that serves static files. `wrangler.jsonc` in the repository root points Wrangler at `site/dist` and serves `404.html` for unknown paths. Connect the repository to a Worker named `archimaid` (the name in `wrangler.jsonc`) with these build settings:

| Setting | Value |
| --- | --- |
| Path (root directory) | empty, the repository root |
| Build command | `npm ci && npm run build && npm ci --prefix site && npm run build --prefix site` |
| Deploy command | `npx wrangler deploy` |
| Environment variable | `NODE_VERSION=24` |

Then add `archimaid.org` as a custom domain.
