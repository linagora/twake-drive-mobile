# Play store listing

Source of truth for the Google Play listing texts and graphics. `fastlane supply`
pushes this tree; the console is not the place to edit it any more.

```
android/fastlane/metadata/android/<locale>/
  title.txt              30 characters max
  short_description.txt  80 characters max
  full_description.txt   4000 characters max
  images/icon.png        512x512, 32-bit PNG
```

Locales mirror the 7 the app ships in: `en-US`, `fr-FR`, `de-DE`, `es-ES`,
`it-IT`, `ru-RU`, `vi`. French is written first, the others are translated from it.

`images/` sits in `en-US` because the icon and the other graphics are uploaded
against the console's default language. If that default is not `en-US`, move the
directory to the locale that is.

## Publishing

Nothing here is pushed by a normal release: the `release` lane skips metadata,
images and changelogs, so an internal-track build never touches the public page.

To publish the listing, run the `Release Android` workflow with `publish_listing`
checked, or locally:

```
cd android && bundle exec fastlane android publish_listing
```

The lane refuses to run while any file is empty or still holds a `TODO`.

## Not covered here

Data safety, content rating, pricing and countries, and the reviewer access
instructions stay in the Play Console. Release notes (`changelogs/<versionCode>.txt`)
are not wired yet.
