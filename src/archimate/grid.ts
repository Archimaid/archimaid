// The geometry that the numbers in a positions block refer to, shared by the language and the renderer.

/** Pixels in one grid unit of a custom layout position or size. */
export const gridUnit = 20;

/**
 * Pixels between the diagram edge and the first grid line, and between a container's edges and its content
 * area. A nested element's grid starts at the container's left edge plus this padding, and below the
 * container's header (`data-archimate-header-height` on its SVG group) plus this padding.
 */
export const layoutPadding = 24;
