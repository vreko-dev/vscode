import { defineComponent, h } from "vue";

export const SnapshotFragile = defineComponent({
	name: "SnapshotFragile",
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
					h("path", { d: "M2 2v12h12V5l-3-3H2zm1 1h6v3h3v8H3V3z", fillRule: "evenodd" }),
					h("path", { d: "M8 7L5 12h6L8 7zm0 1.5l1.8 3H6.2L8 8.5z", fillRule: "evenodd" }),
				],
			);
	},
});
