export default {
	multipass: true,
	floatPrecision: 3,
	plugins: [
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
		{
			name: "convertPathData",
			params: {
				floatPrecision: 3,
				transformPrecision: 5,
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
		"removeDimensions",
	],
};
