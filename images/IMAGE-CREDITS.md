# Listing photo credits

Demo inventory photos are **stock architecture photography** used for product presentation only. They do not depict real MLS listings or imply ownership of the pictured homes.

| Files | Source |
|-------|--------|
| `mansion-1.jpg` … `mansion-8.jpg` | Existing demo mansion set (luxury exteriors) |
| `listing-09.jpg` … `listing-24.jpg` | [Unsplash](https://unsplash.com) free-license residential photos (downloaded 2026-08-10) |
| `gallery/g-01.jpg` … `g-24.jpg` | Unsplash interiors / detail shots for multi-photo galleries |
| `hero-bg.jpg` | Site hero background |

Each of the **24** catalog homes maps to a **unique** primary JPEG (no recycled cards).  
Each listing also has an `images: [...]` array of **4** local photos (primary + gallery mix) for the modal carousel.

When replacing with real listing photography, update `js/properties.js` `image` / `images` paths and keep files under `images/`.
