import { defineComponent, h } from "vue";

export const ActivityAutoSnapshot = defineComponent({
	name: "ActivityAutoSnapshot",
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
					h("path", { d: "M2 5v8h12V5H2zm1 1h10v6H3V6z", fillRule: "evenodd" }),
					h("path", { d: "M5 2v2h1V3h4v1h1V2H5z", fillRule: "evenodd" }),
				],
			);
	},
});
