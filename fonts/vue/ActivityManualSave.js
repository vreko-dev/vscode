import { defineComponent, h } from "vue";

export const ActivityManualSave = defineComponent({
	name: "ActivityManualSave",
	props: {
		class: {
			type: String,
			default: "",
		},
	},
	setup(props, { attrs }) {
		return () =>
			h(
				"svg",
				{
					viewBox: "0 0 20 20",

					class: `svgfont ${props.class}`,
					...attrs,
				},
				[
					h("path", {
						d: "M2 2v12h12V4l-2-2H2zm1 1h2v3h6V3h.6L13 4.4V13H3V3zm3 0h4v2H6V3z",
						fillRule: "evenodd",
					}),
				],
			);
	},
});
