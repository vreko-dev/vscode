import { defineComponent, h } from "vue";

export const SnapshotAi = defineComponent({
	name: "SnapshotAi",
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
					h("path", { d: "M9.5 6L7 9h1.5l-1 3L10 9H8.5l1-3z", fillRule: "evenodd" }),
				],
			);
	},
});
