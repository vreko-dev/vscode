import { defineComponent, h } from "vue";

export const SnapshotStandard = defineComponent({
	name: "SnapshotStandard",
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
				[h("path", { d: "M2 2v12h12V5l-3-3H2zm1 1h6v3h3v8H3V3z", fillRule: "evenodd" })],
			);
	},
});
