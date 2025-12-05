// Place this next to your package.json or in your build pipeline root.
// This config was previously used for SVG optimization. Now using PNG icons from /apps/web/public/images/logos/png/macOS/

export default {
	multipass: true, // multiple optimization rounds for better results
	floatPrecision: 3, // 3 decimal places is visually identical for icons
	plugins: [
		// Core cleanups
		"cleanupAttrs",
		"removeDoctype",
		"removeXMLProcInst",
		"removeComments",
		"removeMetadata",
		"removeEditorsNSData",
		"removeEmptyAttrs",
		"removeHiddenElems",
		"removeEmptyText",
		"removeUselessStrokeAndFill",

		// Safe transforms
		{
			name: "convertPathData",
			params: {
				floatPrecision: 3,
				transformPrecision: 5,
				// Don't simplify curves or merge paths — preserves every pixel
				noSpaceAfterFlags: false,
				makeArcs: false,
			},
		},
		{
			name: "cleanupNumericValues",
			params: { floatPrecision: 3 },
		},
		{
			name: "convertTransform",
			params: { collapseIntoOne: true },
		},
		"removeUnusedNS",
		"sortAttrs",
		"removeDimensions", // optional if you rely on viewBox scaling
	],
};
