# The client deck

`Visual-Analysis-Dashboard.pptx` — thirteen slides covering what the system
watches, the two clock features, the record it keeps, how it is verified, and
what it still cannot do.

Every screenshot in `shots/` was taken from the running product in a real
browser driving real footage — nothing is a mockup. `event-detail-trim.png`
shows an event stamped **2026-08-06** from the recording's own burned-in clock
while the server received it on **2026-08-18**; both timestamps and the raw OCR
text are on the slide because that is what the event record actually stores.

## Rebuilding

```
npm install pptxgenjs      # only if require('pptxgenjs') fails
node deploy/deck/build.js  # writes the .pptx beside this README
```

Paths are resolved from the script's own directory, so it can be run from
anywhere in the repo.

## Re-shooting a slide

The screenshots came from Playwright against a locally served build, with
regions staged through the API first (a "Loading bay" zone, the "Assembly
bench" and "Press station" workstations, the "Meeting room" and "Store room"
doors, and a walkway polygon). Re-shoot at 1500x950 to match the existing set
— `build.js` derives every frame's height from the file's own aspect ratio, so
a differently shaped replacement will be framed correctly but may change how
much room the slide has left.

Four images are hand-trimmed crops (`*-trim.png`). They were cut to land on a
clean boundary rather than mid-row; if you re-crop one, check the bottom edge
does not slice through a line of text.
