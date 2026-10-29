# Product Delivery

## Implemented behavior

Product content is stored in `product_contents` and linked to a product. The
owner content flow supports stored files/media and non-file content. Variant
content can be tied to a specific `product_variants` record.

Relevant implementation:

- `src/services/product/product.service.js` resolves published product details.
- `src/repositories/products.repository.js` reads content and variants.
- `src/services/delivery/delivery.service.js` enforces content access.
- `src/services/delivery/access-control.service.js` checks active entitlement
  and a qualifying order for product-level access.
- `src/controllers/page.controller.js` renders the authenticated `/delivery`
  entitlement list.
- `src/routes/index.js` protects `GET /api/download/:contentId` with
  authentication.

## Access rules

- A request must be authenticated at the download route.
- Published, non-variant content marked `PUBLIC` can be accessed without a
  product entitlement.
- Published, non-variant content marked `PREVIEW` can be accessed without
  purchase only when `is_preview` is true.
- Other non-variant content requires an active entitlement for the user and
  product, with the related order in `PAID`, `PROCESSING`, or `COMPLETED`.
- Variant-bound content requires a qualifying order item for the exact product
  and variant, plus an active entitlement.
- Access to stored content uses a time-limited signed URL. A `LINK` content
  item returns its configured URL.
- Successful access to stored `FILE`, `IMAGE`, `VIDEO`, and `AUDIO` content
  records a download log.

Storage-backed paths beginning with `public-assets/` use the configured
public-asset bucket; other product content paths use the configured private
product bucket. Signed-link lifetime is controlled by `SIGNED_URL_EXPIRATION`.

## Verification boundary

Source structure and deterministic tests can confirm the implemented access
rules, but do not prove every live RLS policy, bucket permission, signed URL,
or browser/user journey against the active Supabase project. Those checks
require configured external services and end-to-end verification.
