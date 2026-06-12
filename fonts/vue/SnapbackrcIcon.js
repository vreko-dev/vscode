import { defineComponent, h } from "vue";

export const SnapbackrcIcon = defineComponent({
	name: "SnapbackrcIcon",
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
					h("path", { d: "M8 1L1 8l7 7 7-7-7-7zm0 12.5L3.5 8 8 3.5 12.5 8 8 12.5z", fillRule: "evenodd" }),
					h("path", { d: "M8 5.5L5.5 8 8 10.5 10.5 8 8 5.5z", fillRule: "evenodd" }),
				],
			);
	},
});
