# Storage

## Bucket contract

The application uses three separately configured bucket names:

| Environment variable | Expected visibility | Purpose |
|---|---|---|
| `PUBLIC_ASSET_BUCKET` | Public | Public assets such as product thumbnails and variant icons |
| `PRIVATE_PRODUCT_BUCKET` | Private | Product delivery files that require access checks |
| `USER_UPLOAD_BUCKET` | Private | User-upload storage boundary |

Defaults are `public-assets`, `private-products`, and `user-uploads`.

At startup, `src/config/storage.js` rejects blank bucket names, surrounding
whitespace, and duplicate configured names. For configured Supabase storage,
it checks the visibility of existing target buckets before creating any
missing bucket. If visibility is wrong, startup fails rather than continuing
with a potentially unsafe configuration. After create operations, it lists
buckets again and verifies that every required bucket exists with the expected
visibility.

The server uses its secret Supabase client for storage operations. Storage keys
must remain in server-side environment variables and must never be shipped to
browser code.

## Upload and delivery

Owner product uploads use signed upload URLs. The server validates uploaded
object metadata and probes the stored bytes before accepting the object.
Product delivery uses the separate access-control service and signed download
URLs for storage-backed content.

## Independent verification

`npm run verify:storage` is a read-only check. It lists bucket metadata and
checks required bucket existence, distinct configured names, and public/private
visibility; it does not call `initStorage()` or create/delete buckets.

This check validates the live bucket configuration only. It does not by itself
prove all RLS behavior, upload lifecycle behavior, or successful product
delivery in a real browser.
