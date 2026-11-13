import { markerExtent } from "../geometry.js";

export const leadLength = 14;
export const bendCost = 20;
export const trackGap = 8;
// Neighbouring anchors with markers need room for a marker and its outline.
export const markerGap = markerExtent;
export const crossingCost = 32;
export const loopReach = 24;
// Weighting the distance still to go above 1 makes the search greedy: it gives up guaranteed shortest
// routes for far fewer expanded states on dense diagrams.
export const heuristicWeight = 1.3;
// Routes first try to stay a comfortable distance from elements, then accept a tight squeeze.
export const clearances = { comfortable: 8, tight: 2 } as const;
// Wide enough for a detour around one neighbouring element and its gap; anything longer searches the full grid.
export const searchMargin = 160;
export const busyDegree = 3;
