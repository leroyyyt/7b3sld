# CO2 Risk Contour Sketcher

Offline HTML tool for sketching approximate CO2 pipeline and terminal risk contour zones on a map screenshot.

## Open

Open `index.html` in a browser. No internet connection or package install is needed.

## Basic workflow

1. Click `Calibrate from scale bar`.
2. Click both ends of the map's `500 m` scale bar.
3. Draw a pipeline by clicking route points, then click `Finish pipeline`.
4. Choose the pipeline size before drawing: 10 inch green, 32 inch red, or 18 inch blue.
5. Click `Terminal` and place source points.
6. Adjust red, orange, and yellow contour radii.
7. Choose `Line contours` for risk-contour-style outlines, or `Connected shading` for merged shaded regions.
8. Click `Save changes` to keep the drawing in this browser.
9. Click `Download PNG`. The exported image includes an automatic legend for the pipeline sizes and contour zones used.

Overlapping contour regions are merged before drawing, so zones that overlap become visually connected instead of appearing as separate stacked shapes.

## Screening contour defaults

The built-in distances are literature-informed screening values, not calculated QRA contours.

- 10 inch dark green: 100 m / 250 m / 500 m
- 18 inch dark blue: 150 m / 400 m / 800 m
- 32 inch dark red: 300 m / 750 m / 1500 m

Basis:

- NIOSH lists CO2 IDLH as 40,000 ppm, with 5,000 ppm TWA and 30,000 ppm short-term exposure limits.
- The Satartia, Mississippi incident involved a 24-inch CO2 pipeline rupture, more than 300 evacuations, and 46 hospital treatments.
- Public reporting for the 2024 Sulphur, Louisiana CO2 pipeline leak described a 0.25-mile shelter-in-place radius.

These are illustrative screening zones, not calculated risk contours. Actual CO2 contours require QRA or dispersion modelling.
