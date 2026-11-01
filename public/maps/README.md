# Supplied map artwork

`campus.jpg` (1254 × 1254) and `floor-plans.jpg` (2048 × 682) are the original
JPEG streams embedded in the user's `RADAR_Exact_Design_Game_Prompt_Compact.pdf`.
They were extracted with `pdfimages -f 1 -l 1 -j` and copied without recompression,
redrawing, or image generation. The separate original PNGs were not available.
Ownership and licensing of the supplied artwork remain with their respective owners.

The explorer renders these files at their original aspect ratios. Indoor scenes use
SVG viewBox crops of the same full floor-plan image. Gameplay, selection, character,
and path indicators are separate elements. “Original artwork only” hides them all.

Map geometry is in `src/components/map/campus-data.ts`. All measurements are source
image pixels; `crop` controls framing, `walkable` rectangles define a conservative
connected navigation mask, and rooms/entrances define destinations. These are
illustration coordinates, not survey measurements or verified evacuation routes.
The map is independent of geographic school database records.

Building A has one floor and two doors. Building B has two floors and two doors per
floor. Building 6 has two floors and five doors per floor; its outdoor entrance is
unassigned. No interiors are invented for the other campus buildings. Room IDs
(A-101, B-201, etc.) are local exploration labels, not database classroom IDs.

Open the app's Map page and select Campus explorer. Use arrow keys/WASD, touch
direction buttons, or click a mapped path/building. E interacts at an entrance,
exit, or staircase. The room selector navigates from campus through the corresponding
building and its internal stairs. Indoor floor plans opens the source sheet and
allows independent interior previews. Geographic map opens the existing map workflow.

Run `npm test` for API and navigation checks and `npm run build` for the type check
and production bundle. Map rendering works without external tile providers.
